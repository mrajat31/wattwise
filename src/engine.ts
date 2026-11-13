import type { Appliance, Bill } from './data.ts'

// Illustrative reference rates, not a verified/current MERC tariff schedule.
const energyRates = [4.71, 9.64, 14.55, 16.64]
const wheelingPerUnit = 1.15
const facPerUnit = 0.35
const duty = 0.16
export const generationWaterBenchmark = {
  litresPerKwh: 2.2,
  year: 2016,
  source: 'https://files.wri.org/d8/s3fs-public/parched-power-india.pdf',
}

export function generationWaterLitres(units: number): number {
  if (!Number.isFinite(units) || units < 0) throw new Error('Electricity units must be a non-negative number.')
  return units * generationWaterBenchmark.litresPerKwh
}

const slabs = [
  { label: 'First 100 units', limit: 100 },
  { label: 'Next 200 units', limit: 200 },
  { label: 'Next 200 units', limit: 200 },
  { label: 'Above 500 units', limit: Number.POSITIVE_INFINITY },
]

export type SimulationSettings = { acTemperature?: number; geyserStandby?: boolean; bldcFans?: boolean }
export type Slab = { label: string; units: number; cost: number }
export type Recommendation = {
  id: string
  effort: 'Free habit' | 'Small fix' | 'Upgrade'
  title: string
  description: string
  kwhSaved: number
  monthlySavings: number
  action?: 'ac' | 'geyser' | 'fans'
}

export function calculateBill(units: number, phase: Bill['phase'], fixedOverride?: number) {
  if (!Number.isFinite(units) || units < 0) throw new Error('Electricity units must be a non-negative number.')
  if (fixedOverride !== undefined && (!Number.isFinite(fixedOverride) || fixedOverride < 0)) throw new Error('Fixed charge must be a non-negative number.')
  let remaining = units
  let totalEnergy = 0
  const bucketUnits = slabs.map((slab, index) => {
    const allocated = Math.min(remaining, slab.limit)
    totalEnergy += allocated * energyRates[index]
    remaining -= allocated
    return allocated
  })
  const wheeling = units * wheelingPerUnit
  const fac = units * facPerUnit
  const electricityDuty = (totalEnergy + wheeling + fac) * duty
  const fixedCharge = fixedOverride ?? (phase === 'Three phase' ? 435 : 130)
  const marginalRate = (energyRates[units > 500 ? 3 : units > 300 ? 2 : units > 100 ? 1 : 0] + wheelingPerUnit + facPerUnit) * (1 + duty)
  return { total: totalEnergy + wheeling + fac + electricityDuty + fixedCharge, totalEnergy, wheeling, fac, electricityDuty, fixedCharge, marginalRate, bucketUnits }
}

export function getBreakdown(units: number): Slab[] {
  const bill = calculateBill(units, 'Single phase', 0)
  return slabs.map((slab, index) => ({
    label: slab.label, units: bill.bucketUnits[index],
    cost: bill.bucketUnits[index] * (energyRates[index] + wheelingPerUnit + facPerUnit) * (1 + duty),
  }))
}

export function applianceKwh(appliance: Appliance, settings: SimulationSettings = {}, days = 30): number {
  const quantity = appliance.count
  const runtime = appliance.hoursPerDay * days
  if (appliance.category === 'AC') {
    const temperature = settings.acTemperature ?? appliance.setpoint ?? 24
    return appliance.watts / 1000 * runtime * (1 + Math.max(0, 24 - temperature) * 0.06) * quantity
  }
  if (appliance.category === 'Geyser') {
    const standby = (settings.geyserStandby ?? appliance.standby ?? false) ? 0.6 * days : 0
    return (appliance.watts / 1000 * runtime + standby) * quantity
  }
  if (appliance.category === 'Fan') {
    const watts = settings.bldcFans && appliance.watts >= 60 ? 28 : appliance.watts
    return watts / 1000 * runtime * quantity
  }
  if (appliance.category === 'Refrigerator' && appliance.annualKwh !== undefined) {
    return appliance.annualKwh / 365 * days * appliance.hoursPerDay / 24 * quantity
  }
  const dutyCycle = appliance.category === 'Refrigerator' ? 0.33
    : ['Washing machine', 'Dishwasher'].includes(appliance.category) ? 0.55 : 1
  return appliance.watts / 1000 * runtime * dutyCycle * quantity
}

export function getMonthlyKwh(appliances: Appliance[], settings: SimulationSettings = {}, days = 30): number {
  return appliances.reduce((sum, appliance) => sum + applianceKwh(appliance, settings, days), 0)
}

export function simulateBill(bill: Bill, appliances: Appliance[], settings: SimulationSettings) {
  const baseUnits = getMonthlyKwh(appliances, {}, bill.billingDays)
  const changedUnits = getMonthlyKwh(appliances, settings, bill.billingDays)
  const projectedUnits = Math.max(0, bill.units + changedUnits - baseUnits)
  const tariffDifference = calculateBill(projectedUnits, bill.phase, bill.fixedCharge).total - calculateBill(bill.units, bill.phase, bill.fixedCharge).total
  const projectedAmount = Math.max(0, bill.totalPayable + tariffDifference)
  return { projectedUnits, projectedAmount, savings: bill.totalPayable - projectedAmount }
}

export function getRecommendations(bill: Bill, appliances: Appliance[]): Recommendation[] {
  const modeledUnits = getMonthlyKwh(appliances, {}, bill.billingDays)
  const profileAdvice: Recommendation = {
    id: 'profile', effort: 'Free habit', title: 'Check your appliance list and daily hours',
    description: modeledUnits > bill.units
      ? 'The devices you listed add up to more than your bill. Check quantities and hours before relying on savings estimates.'
      : 'Some of your electricity use is not explained yet. Add missing devices before assuming there is a fault or wasted energy.',
    kwhSaved: 0, monthlySavings: 0,
  }
  if (appliances.length && modeledUnits > bill.units * 1.2) return [profileAdvice]
  const recommendations: Recommendation[] = []
  if (appliances.some((appliance) => appliance.category === 'AC' && (appliance.setpoint ?? 24) < 24)) {
    const acs = appliances.filter((appliance) => appliance.category === 'AC')
    const saved = acs.reduce((sum, ac) => sum + Math.max(0, applianceKwh(ac, {}, bill.billingDays) - applianceKwh(ac, { acTemperature: Math.max(24, ac.setpoint ?? 24) }, bill.billingDays)), 0)
    recommendations.push({
      id: 'ac', effort: 'Free habit', action: 'ac', title: 'Set your AC to 24°C instead of colder',
      description: 'Keep the room comfortable without making the compressor work as hard. Try this tonight.',
      kwhSaved: saved, monthlySavings: savedValue(bill, saved),
    })
  }
  const standbyGeysers = appliances.filter((appliance) => appliance.category === 'Geyser' && appliance.standby)
  if (standbyGeysers.length) {
    const saved = standbyGeysers.reduce((sum, item) => sum + 0.6 * bill.billingDays * item.count, 0)
    recommendations.push({
      id: 'geyser', effort: 'Free habit', action: 'geyser', title: 'Switch off your geyser between uses',
      description: 'Heat water when you need it instead of keeping it hot all day. A properly rated timer is optional.',
      kwhSaved: saved, monthlySavings: savedValue(bill, saved),
    })
  }
  const fans = appliances.filter((appliance) => appliance.category === 'Fan' && appliance.watts >= 60)
  if (fans.reduce((sum, fan) => sum + fan.count, 0) >= 3 && fans.some((fan) => fan.hoursPerDay > 12)) {
    const saved = fans.reduce((sum, fan) => sum + (fan.watts - 28) / 1000 * fan.hoursPerDay * bill.billingDays * fan.count, 0)
    recommendations.push({
      id: 'fans', effort: 'Upgrade', action: 'fans', title: 'Consider efficient fans when replacing yours',
      description: 'Your fans run for long hours. A 28W BLDC model can use less power than a standard fan. Compare purchase cost before upgrading.',
      kwhSaved: saved, monthlySavings: savedValue(bill, saved),
    })
  }
  if (appliances.length && modeledUnits < bill.units * 0.8) recommendations.push(profileAdvice)
  return recommendations.sort((a, b) => b.monthlySavings - a.monthlySavings)
}

function savedValue(bill: Bill, units: number): number {
  return Math.min(bill.totalPayable, Math.max(0, calculateBill(bill.units, bill.phase, bill.fixedCharge).total - calculateBill(Math.max(0, bill.units - units), bill.phase, bill.fixedCharge).total))
}
