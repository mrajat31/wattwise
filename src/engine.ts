import type { Appliance, Bill } from './data.ts'

export type Tariff = { from: string; to: string; label: string; variableRates: readonly [number, number, number, number]; fixed: number; threePhaseFixed: number; source: string }
const currentOrder = 'https://www.mahadiscom.in/wp-content/uploads/2026/07/Tariff-Order_Case-No.-75-of-2025-dated-25th-March-2026.pdf'
const tariffs: Tariff[] = [
  { from: '2021-04', to: '2022-03', label: 'MERC FY 2021–22 · Table 8-17', variableRates: [4.82, 8.72, 11.74, 13.20], fixed: 102, threePhaseFixed: 340, source: 'https://www.mahadiscom.in/consumer/wp-content/uploads/2020/03/Order-322-of-2019.pdf' },
  { from: '2025-07', to: '2026-03', label: 'MERC FY 2025–26 · p. 94', variableRates: [5.74, 12.57, 16.85, 19.15], fixed: 130, threePhaseFixed: 430, source: currentOrder },
  { from: '2026-04', to: '2027-03', label: 'MERC FY 2026–27 · p. 95', variableRates: [5.56, 12.40, 16.64, 19.13], fixed: 130, threePhaseFixed: 435, source: currentOrder },
]
export const savingsGuidance = { label: 'US DOE Energy Saver (2022)', source: 'https://www.energy.gov/sites/default/files/2022-08/energy-saver-guide-2022.pdf' }

export function getTariff(billingMonth: string): Tariff | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) throw new Error('A valid billing month is required for tariff lookup.')
  return tariffs.find((tariff) => billingMonth >= tariff.from && billingMonth <= tariff.to) ?? null
}
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

export type SimulationSettings = { acTemperature?: number; geyserStandby?: boolean; bldcFans?: boolean; applianceHours?: Record<string, number> }
export type RuntimeSuggestion = { applianceId: string; title: string; description: string; hoursPerDay: number }
export type Slab = { label: string; units: number; cost: number }
export type Recommendation = {
  id: string
  effort: 'Free habit' | 'Small fix' | 'Upgrade'
  title: string
  description: string
  kwhSaved: number
  monthlySavings: number | null
  source?: string
  action?: 'ac' | 'geyser' | 'fans' | { applianceId: string; hoursPerDay: number }
}

export function calculateBill(units: number, phase: Bill['phase'], fixedOverride?: number, tariff: Tariff = tariffs[2]) {
  if (!Number.isFinite(units) || units < 0) throw new Error('Electricity units must be a non-negative number.')
  if (fixedOverride !== undefined && (!Number.isFinite(fixedOverride) || fixedOverride < 0)) throw new Error('Fixed charge must be a non-negative number.')
  let remaining = units
  let variableCost = 0
  const bucketUnits = slabs.map((slab, index) => {
    const allocated = Math.min(remaining, slab.limit)
    variableCost += allocated * tariff.variableRates[index]
    remaining -= allocated
    return allocated
  })
  const fixedCharge = fixedOverride ?? (phase === 'Three phase' ? tariff.threePhaseFixed : tariff.fixed)
  const marginalRate = tariff.variableRates[units > 500 ? 3 : units > 300 ? 2 : units > 100 ? 1 : 0]
  return { total: variableCost + fixedCharge, variableCost, fixedCharge, marginalRate, bucketUnits }
}

export function getBreakdown(units: number, tariff: Tariff): Slab[] {
  const bill = calculateBill(units, 'Single phase', 0, tariff)
  return slabs.map((slab, index) => ({
    label: slab.label, units: bill.bucketUnits[index],
    cost: bill.bucketUnits[index] * tariff.variableRates[index],
  }))
}

export function applianceKwh(appliance: Appliance, settings: SimulationSettings = {}, days = 30): number {
  const quantity = appliance.count
  const hoursPerDay = settings.applianceHours?.[appliance.id] ?? appliance.hoursPerDay
  if (!Number.isFinite(hoursPerDay) || hoursPerDay < 0 || hoursPerDay > 24) throw new Error('Device hours must be between 0 and 24.')
  const runtime = hoursPerDay * days
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
    return appliance.annualKwh / 365 * days * hoursPerDay / 24 * quantity
  }
  const dutyCycle = appliance.category === 'Refrigerator' ? 0.33
    : ['Washing machine', 'Dishwasher'].includes(appliance.category) ? 0.55 : 1
  return appliance.watts / 1000 * runtime * dutyCycle * quantity
}

const runtimeChanges: Partial<Record<Appliance['category'], { reduction: number; title: string; description: string }>> = {
  AC: { reduction: 1, title: 'try 1 hour less cooling a day', description: 'Only during a time you do not need cooling; keep occupied rooms comfortable.' },
  Fan: { reduction: 1, title: 'switch off for 1 unused hour a day', description: 'Only while the room is empty; efficient fans qualify too.' },
  Computer: { reduction: 1, title: 'shut down for 1 unused hour a day', description: 'Only during idle time, not work or study.' },
  Geyser: { reduction: 10 / 60, title: 'try 10 minutes less heating a day', description: 'Only if less hot water is needed; standby stays unchanged.' },
  'Washing machine': { reduction: 0.5 / 7, title: 'combine loads: 30 minutes less a week', description: 'Combine needed washes into full loads without overloading.' },
  Dishwasher: { reduction: 0.5 / 7, title: 'combine loads: 30 minutes less a week', description: 'Only if fuller loads let you run it less often.' },
}

export function getRuntimeSuggestions(appliances: Appliance[]): RuntimeSuggestion[] {
  return appliances.flatMap((appliance) => {
    const change = runtimeChanges[appliance.category]
    if (!change || appliance.hoursPerDay <= change.reduction) return []
    return [{
      applianceId: appliance.id,
      title: `${appliance.name}${appliance.count > 1 ? ` (all ${appliance.count})` : ''}: ${change.title}`,
      description: change.description,
      hoursPerDay: appliance.hoursPerDay - change.reduction,
    }]
  })
}

const energyTips: { category: Appliance['category']; title: string; description: string; effort: Recommendation['effort'] }[] = [
  { category: 'AC', title: 'Keep AC filters clean and cooled rooms closed', description: 'Follow the cleaning instructions in your AC manual and close doors and windows while cooling. The saving depends on the room and equipment; we do not put a rupee figure on this.', effort: 'Free habit' },
  { category: 'Fan', title: 'Try a lower fan speed when comfortable', description: 'Clean blades for good airflow and use only the speed you need. Power at each speed varies by model, so no saving is assumed.', effort: 'Free habit' },
  { category: 'Geyser', title: 'Fix leaking hot-water taps', description: 'A hot-water leak can waste both water and heating energy. Have faulty taps repaired; keep the heater at its manufacturer-recommended safe settings.', effort: 'Small fix' },
  { category: 'Refrigerator', title: 'Help your fridge keep the cold inside', description: 'Close the door promptly, check the seals, and leave the ventilation space recommended in the manual. Keep the fridge running; do not switch it off to create a saving.', effort: 'Small fix' },
  { category: 'Washing machine', title: 'Use a cold or eco wash when suitable', description: 'Choose a setting suitable for the fabric and cleaning needed, following your machine instructions. Eco cycles can run longer while using less energy; we do not treat shorter time as proof of a more efficient cycle.', effort: 'Free habit' },
  { category: 'Dishwasher', title: 'Try eco mode and avoid unnecessary heated drying', description: 'Use these options only where your dishwasher supports them and they suit the load. Cycle energy varies, so we do not assume a saving from its name or duration.', effort: 'Free habit' },
  { category: 'Induction', title: 'Use flat, matching cookware and a lid when suitable', description: 'Use induction-compatible pans that fit the cooking zone. A lid can reduce heat loss where the recipe allows; still cook food fully.', effort: 'Free habit' },
  { category: 'Computer', title: 'Enable automatic sleep during idle time', description: 'Use your computer and monitor power-saving settings instead of leaving them fully active. Keep needed tasks running; actual sleep power is not known from your device list.', effort: 'Free habit' },
  { category: 'EV charger', title: 'Help your EV use less energy for the same distance', description: 'Maintain tyres at the vehicle manufacturer-recommended pressure and follow its efficiency guidance. Do not cut essential charging; charging at night is not automatically cheaper on your tariff.', effort: 'Free habit' },
  { category: 'Inverter', title: 'Keep backup-system losses in check', description: 'Follow the manufacturer’s maintenance guidance and use qualified servicing. Do not switch off essential backup or count its output rating as extra electricity use; loss savings need measurements.', effort: 'Small fix' },
  { category: 'Water purifier', title: 'Maintain purifier filters and prevent leaks', description: 'Follow your Aquaguard/RO/UV manufacturer’s filter and servicing schedule. Keep required hygiene cycles active; savings depend on measured pump and standby use.', effort: 'Small fix' },
  { category: 'Television', title: 'Use TV eco settings and turn off an unused screen', description: 'Match brightness to the room and use automatic sleep when suitable. Actual savings depend on the TV and settings; no fixed percentage is assumed.', effort: 'Free habit' },
  { category: 'Speaker', title: 'Switch off unused speakers or use automatic standby', description: 'Stop playback when nobody is listening and use supported power-saving settings. Active and standby power differ; no standby saving is invented.', effort: 'Free habit' },
  { category: 'Light bulb', title: 'Choose LEDs with matching brightness', description: 'When replacing older bulbs, compare brightness in lumens rather than watts. Turn off unneeded lights while keeping paths and occupied rooms safely lit.', effort: 'Free habit' },
  { category: 'Tube light', title: 'Compare LED tubes with older fluorescent lighting', description: 'Choose equivalent brightness and compatible fittings; use qualified help for electrical changes. Switch off only lights you do not need.', effort: 'Free habit' },
  { category: 'Mobile charger', title: 'Count active phone charging, not all-day plug time', description: 'A charger does not draw its full rating continuously after charging finishes. Do not cut needed charging to create an apparent saving.', effort: 'Free habit' },
  { category: 'Other', title: 'Use efficient lighting and switch off unused devices', description: 'When replacing conventional bulbs, compare LEDs with the same brightness in lumens. Turn off only nonessential unused devices; keep medical, security, and needed networking equipment on.', effort: 'Free habit' },
]

export function getMonthlyKwh(appliances: Appliance[], settings: SimulationSettings = {}, days = 30): number {
  return appliances.reduce((sum, appliance) => sum + applianceKwh(appliance, settings, days), 0)
}

export function simulateBill(bill: Bill, appliances: Appliance[], settings: SimulationSettings) {
  const baseUnits = getMonthlyKwh(appliances, {}, bill.billingDays)
  const changedUnits = getMonthlyKwh(appliances, settings, bill.billingDays)
  const projectedUnits = Math.max(0, bill.units + (changedUnits - baseUnits))
  const tariff = getTariff(bill.billingMonth)
  if (!tariff) return { projectedUnits, projectedAmount: null, savings: null, tariff: null }
  const tariffDifference = calculateBill(projectedUnits, bill.phase, bill.fixedCharge, tariff).total - calculateBill(bill.units, bill.phase, bill.fixedCharge, tariff).total
  const projectedAmount = Math.max(0, bill.totalPayable + tariffDifference)
  return { projectedUnits, projectedAmount, savings: bill.totalPayable - projectedAmount, tariff }
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
  const tips: Recommendation[] = energyTips.filter((tip) => appliances.some((appliance) => appliance.category === tip.category && appliance.hoursPerDay > 0)).map((tip) => ({
    id: `tip-${tip.category}`, effort: tip.effort, title: tip.title, description: tip.description,
    kwhSaved: 0, monthlySavings: 0, source: ['EV charger', 'Inverter', 'Water purifier'].includes(tip.category) ? undefined : savingsGuidance.source,
  }))
  if (appliances.length && modeledUnits > bill.units * 1.2) return [profileAdvice, ...tips]
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
  for (const suggestion of getRuntimeSuggestions(appliances)) {
    const saved = modeledUnits - getMonthlyKwh(appliances, { applianceHours: { [suggestion.applianceId]: suggestion.hoursPerDay } }, bill.billingDays)
    if (saved > 0) recommendations.push({
      id: `hours-${suggestion.applianceId}`, effort: 'Free habit',
      title: suggestion.title, description: suggestion.description,
      kwhSaved: saved, monthlySavings: savedValue(bill, saved),
      action: { applianceId: suggestion.applianceId, hoursPerDay: suggestion.hoursPerDay },
    })
  }
  recommendations.push(...tips)
  if (appliances.length && modeledUnits < bill.units * 0.8) recommendations.push(profileAdvice)
  return recommendations.sort((a, b) => (b.monthlySavings ?? 0) - (a.monthlySavings ?? 0) || b.kwhSaved - a.kwhSaved)
}

function savedValue(bill: Bill, units: number): number | null {
  const tariff = getTariff(bill.billingMonth)
  if (!tariff) return null
  return Math.min(bill.totalPayable, Math.max(0, calculateBill(bill.units, bill.phase, bill.fixedCharge, tariff).total - calculateBill(Math.max(0, bill.units - units), bill.phase, bill.fixedCharge, tariff).total))
}
