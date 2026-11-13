import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareBills, confirmBill, msedclFieldRegions, parseBillText, validateBillBatch } from './bills.ts'
import { applianceKwh, calculateBill, generationWaterLitres, getRecommendations, simulateBill } from './engine.ts'
import { aiReplySchema, guidedReply } from './conversation.ts'
import { createHome, type Appliance, type Bill, type Workspace } from './data.ts'
import { loadProfileStore, loadWorkspace, profileStorageKey, saveProfileStore, saveWorkspace, storageKey } from './storage.ts'

const bill: Bill = {
  id: 'oct', units: 338, phase: 'Single phase', fixedCharge: 130, billingMonth: '2026-10',
  billingDays: 30, history: [], totalPayable: 4215, source: 'October.pdf', consumerNumber: '170012345678',
}
const ac: Appliance = {
  id: 'ac', name: 'Bedroom AC', category: 'AC', brand: '', model: 'Unknown',
  watts: 1000, hoursPerDay: 6, count: 1, setpoint: 22,
}

function memoryStorage() {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

test('bill extraction uses labelled values and month, including comma amounts and zero units', () => {
  const draft = parseBillText('Consumer No: 170012345678 Bill Month: October 2026 Billed Units: 0 Amount Payable: Rs. 1,215.50 Billing Days: 31 Fixed Charge: 130 Single Phase', 'actual.pdf')
  assert.equal(draft.billingMonth, '2026-10')
  assert.equal(draft.units, '0')
  assert.equal(draft.totalPayable, '1215.50')
  assert.equal(confirmBill(draft).billingDays, 31)
})

test('an unreadable bill cannot invent dates, amounts, phase or previous history', () => {
  const draft = parseBillText('A photo with an unclear table', 'unclear.jpg')
  assert.equal(draft.billingMonth, '')
  assert.equal(draft.units, '')
  assert.equal(draft.totalPayable, '')
  assert.equal(draft.phase, '')
  assert.throws(() => confirmBill(draft), /Please enter/)
})

test('MSEDCL Marathi bill extracts regular amount, phase, consumer and days between meter readings', () => {
  const draft = parseBillText(`
    BILL OF SUPPLY FOR THE MONTH OF - जानेवारी-२०२२
    ह्राहक क्रमांक: 170012345678 मोबाईल/ईमेल: 93xxxxxx55
    देयक दिनांक 11-01-2022
    देयक रक्‍कम रु
    140.00
    देय दिनांक 31-01-2022
    या तारखे नंतर भरल्यास 150.00
    दर संकेत: 92/LT I Res 3-Phase
    चालु रिडिंग दिनांक 06-01-2022
    मागील रिडिंग दिनांक 07-12-2021
    Total consumption: 110
    या तारखे पर्यंत भरल्यास 20-01-2022 Rs. 130.00
  `, 'msedcl.jpg')
  assert.equal(draft.billingMonth, '2022-01')
  assert.equal(draft.totalPayable, '140.00')
  assert.equal(draft.units, '110')
  assert.equal(draft.phase, 'Three phase')
  assert.equal(draft.consumerNumber, '170012345678')
  assert.equal(draft.billingDays, '30')
  assert.equal(draft.fixedCharge, '')
  assert.match(draft.warning, /between the previous and current/)
  assert.match(draft.warning, /early\/late payment amounts are not fixed charges/)
  assert.equal(confirmBill(draft).fixedCharge, undefined)
})

test('MSEDCL text table uses total usage rather than current reading and reads Marathi fixed charge', () => {
  const draft = parseBillText(`
    BILL OF SUPPLY FOR THE MONTH OF - फेब्रुवारी-२०२४
    ग्राहक क्रमांक: १७००१२३४५६७८
    देयक रक्कम रु: ९८०.५०
    दर संकेत: LT I Res 1-Phase
    चालू रिडिंग दिनांक: 01-03-2024
    मागील रिडिंग दिनांक: 01-02-2024
    चालू रिडिंग मागील रिडिंग गुणक अवयव युनिट समा. युनिट एकूण वापर
    3618 3508 1.00 110 0 110
    स्थिर आकार: रु १२८.००
  `, 'msedcl.pdf')
  assert.equal(draft.billingMonth, '2024-02')
  assert.equal(draft.units, '110')
  assert.equal(draft.totalPayable, '980.50')
  assert.equal(draft.fixedCharge, '128.00')
  assert.equal(draft.consumerNumber, '170012345678')
  assert.equal(draft.billingDays, '29')
  assert.equal(draft.phase, 'Single phase')
})

test('reading dates reject impossible or reversed periods and do not use issue or due dates', () => {
  assert.equal(parseBillText('देयक दिनांक 11-01-2022 देय दिनांक 31-01-2022', 'dates.jpg').billingDays, '')
  assert.equal(parseBillText('Current reading date: 31-02-2022 Previous reading date: 01-02-2022', 'bad.jpg').billingDays, '')
  assert.equal(parseBillText('Current reading date: 01-01-2022 Previous reading date: 01-02-2022', 'bad.jpg').billingDays, '')
  assert.equal(parseBillText('Current reading date: 10601-2022 Previous reading date: 107-12-2021', 'refined.jpg').billingDays, '30')
  assert.equal(parseBillText('Billing days: 31 Current reading date: 06-01-2022 Previous reading date: 07-12-2021', 'explicit.jpg').billingDays, '31')
})

test('Hindi labels and month names map to the same bill fields without AI translation', () => {
  const draft = parseBillText(`
    बिल का महीना: फरवरी-२०२४
    उपभोक्ता संख्या: १७००१२३४५६७८
    कुल खपत: १२५
    देय राशि: रु १,२५०.५०
    नियत शुल्क: रु १२८.००
    कनेक्शन: सिंगल फेज
    वर्तमान मीटर रीडिंग तिथि: 01-03-2024
    पिछली मीटर रीडिंग तिथि: 01-02-2024
  `, 'hindi.jpg')
  const confirmed = confirmBill(draft)
  assert.equal(confirmed.billingMonth, '2024-02')
  assert.equal(confirmed.units, 125)
  assert.equal(confirmed.totalPayable, 1250.50)
  assert.equal(confirmed.fixedCharge, 128)
  assert.equal(confirmed.phase, 'Single phase')
  assert.equal(confirmed.consumerNumber, '170012345678')
  assert.equal(confirmed.billingDays, 29)
})

test('MSEDCL OCR regions align total-usage column and reading dates without selecting history or other columns', () => {
  const lines = [
    { text: 'एकृण वापर |', bbox: { x0: 450, y0: 340, x1: 520, y1: 370 } },
    { text: '3618', bbox: { x0: 30, y0: 385, x1: 65, y1: 395 } },
    { text: '110', bbox: { x0: 480, y0: 385, x1: 500, y1: 395 } },
    { text: '220', bbox: { x0: 480, y0: 650, x1: 500, y1: 660 } },
    { text: 'चालु रिडिंग दिनांक', bbox: { x0: 355, y0: 285, x1: 445, y1: 302 } },
    { text: '१05-01-2022', bbox: { x0: 470, y0: 288, x1: 530, y1: 299 } },
    { text: 'मागील रिडिंग दिनांक', bbox: { x0: 355, y0: 305, x1: 445, y1: 320 } },
    { text: '१07-12-2021', bbox: { x0: 470, y0: 308, x1: 530, y1: 319 } },
  ]
  assert.deepEqual(msedclFieldRegions(lines).map(({ label, line }) => [label, line.text]), [
    ['Total consumption', '110'],
    ['Current reading date', '१05-01-2022'],
    ['Previous reading date', '१07-12-2021'],
  ])
  const obscuredHeader = lines.filter((line) => !/वापर/.test(line.text))
  obscuredHeader.push({ text: 'Meter Status: Normal', bbox: { x0: 25, y0: 415, x1: 150, y1: 435 } })
  assert.equal(msedclFieldRegions(obscuredHeader).find((field) => field.label === 'Total consumption')?.line.text, '110')
  assert.equal(msedclFieldRegions(obscuredHeader.filter((line) => line.text !== '110')).some((field) => field.label === 'Total consumption'), false)
  const amountLines = [
    { text: 'देयक रक्कम रु', bbox: { x0: 550, y0: 140, x1: 620, y1: 155 } },
    { text: '140.00', bbox: { x0: 695, y0: 142, x1: 725, y1: 152 } },
    { text: '411048', bbox: { x0: 35, y0: 160, x1: 75, y1: 170 } },
  ]
  assert.equal(msedclFieldRegions(amountLines).find((field) => field.label === 'Bill amount')?.line.text, '140.00')
  const scrambled = 'देयक रक्कम रु\n\n411048\n\nMapped bill amount: 140.00'
  assert.equal(parseBillText(scrambled, 'ocr.jpg').totalPayable, '140.00')
  assert.equal(parseBillText(scrambled.replace('Mapped bill amount: 140.00', 'Mapped bill amount: '), 'ocr.jpg').totalPayable, '')
})

test('confirmation rejects bad numbers and invalid months', () => {
  const draft = parseBillText('Bill Month: 10/2026 Billed Units: 338 Net Payable: 4215 Billing Days: 30 Single Phase', 'bill.pdf')
  assert.throws(() => confirmBill({ ...draft, units: '-1' }))
  assert.throws(() => confirmBill({ ...draft, billingDays: '0' }))
  assert.throws(() => confirmBill({ ...draft, billingMonth: '2026-13' }))
})

test('multi-bill save rejects duplicates within an upload or already saved and mixed connections', () => {
  assert.throws(() => validateBillBatch([bill, { ...bill, id: 'other' }], []), /appears twice/)
  assert.throws(() => validateBillBatch([bill], [bill]), /already saved/)
  assert.throws(() => validateBillBatch([{ ...bill, billingMonth: '2026-09', consumerNumber: '170098765432' }], [bill]), /different consumer/)
  assert.doesNotThrow(() => validateBillBatch([{ ...bill, id: 'sep', billingMonth: '2026-09' }], [bill]))
})

test('comparison reports actual amount changes and normalizes unequal billing periods', () => {
  const first = { ...bill, units: 280, totalPayable: 3000, billingDays: 28 }
  const next = { ...bill, units: 310, totalPayable: 3300, billingDays: 31 }
  assert.deepEqual(compareBills(first, next), { amountDifference: 300, unitDifference: 30, dailyUnitDifference: 0, percentChange: 10 })
  assert.equal(compareBills({ ...first, totalPayable: 0 }, next).percentChange, null)
})

test('new homes are empty and persistence keeps bills and conversations isolated', () => {
  const first = createHome('Our apartment')
  const second = createHome('Parents home')
  assert.deepEqual(first.bills, [])
  assert.deepEqual(second.appliances, [])
  first.bills = [bill]
  first.messages = [{ id: 'msg', from: 'user', text: 'One AC' }]
  const state: Workspace = { version: 2, name: 'Asha', homes: [first, second], activeHomeId: second.id }
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
  assert.equal(loadWorkspace(storage), null)
  saveWorkspace(storage, state)
  assert.deepEqual(loadWorkspace(storage), state)
  assert.equal(loadWorkspace(storage)?.homes[1].bills.length, 0)
  data.set(storageKey, '{not valid}')
  assert.throws(() => loadWorkspace(storage))
})

test('local profiles migrate existing workspaces without altering the legacy snapshot and stay signed out on reload', () => {
  const storage = memoryStorage()
  const home = createHome('Existing home')
  home.bills = [bill]
  home.messages = [{ id: 'existing-msg', from: 'user', text: 'My device list' }]
  const workspace: Workspace = { version: 2, name: 'Existing user', homes: [home], activeHomeId: home.id }
  saveWorkspace(storage, workspace)
  const original = storage.getItem(storageKey)
  const migrated = loadProfileStore(storage)
  assert.equal(migrated.profiles.length, 1)
  assert.equal(migrated.activeProfileId, migrated.profiles[0].id)
  assert.deepEqual(migrated.profiles[0].workspace, workspace)
  saveProfileStore(storage, { ...migrated, activeProfileId: null })
  assert.equal(loadProfileStore(storage).activeProfileId, null)
  assert.deepEqual(loadProfileStore(storage).profiles[0].workspace, workspace)
  assert.equal(storage.getItem(storageKey), original)
})

test('separate user profiles preserve their own homes, bills and conversations when reopening', () => {
  const storage = memoryStorage()
  const first = createHome('First home')
  first.bills = [bill]
  first.appliances = [ac]
  first.messages = [{ id: 'first-chat', from: 'user', text: 'One AC' }]
  const second = createHome('Second home')
  const profiles = [
    { id: 'first-user', workspace: { version: 2 as const, name: 'First user', homes: [first], activeHomeId: first.id } },
    { id: 'second-user', workspace: { version: 2 as const, name: 'Second user', homes: [second], activeHomeId: second.id } },
  ]
  saveProfileStore(storage, { version: 3, profiles, activeProfileId: 'second-user' })
  const state = loadProfileStore(storage)
  assert.deepEqual(state.profiles[1].workspace.homes[0].bills, [])
  assert.deepEqual(state.profiles[1].workspace.homes[0].appliances, [])
  assert.deepEqual(state.profiles[1].workspace.homes[0].messages, [])
  saveProfileStore(storage, { ...state, activeProfileId: 'first-user' })
  assert.deepEqual(loadProfileStore(storage).profiles[0].workspace.homes[0], first)
})

test('corrupt profile storage never falls back to legacy data and invalid profile references are rejected', () => {
  const storage = memoryStorage()
  const home = createHome('Home')
  const workspace: Workspace = { version: 2, name: 'User', homes: [home], activeHomeId: home.id }
  saveWorkspace(storage, workspace)
  storage.setItem(profileStorageKey, '{broken}')
  assert.throws(() => loadProfileStore(storage))
  assert.equal(storage.getItem(profileStorageKey), '{broken}')
  const profile = { id: 'user', workspace }
  assert.throws(() => saveProfileStore(storage, { version: 3, activeProfileId: 'missing', profiles: [profile] }), /active profile/)
  assert.throws(() => saveProfileStore(storage, { version: 3, activeProfileId: null, profiles: [profile, profile] }), /unique/)
  assert.throws(() => saveProfileStore(storage, { version: 3, activeProfileId: 'user', profiles: [{ ...profile, workspace: { ...workspace, activeHomeId: 'missing' } }] }), /active home/)
})

test('generation-water equivalent uses billed units rather than bill amount or assumed days', () => {
  assert.ok(Math.abs(generationWaterLitres(110) - 242) < 1e-8)
  assert.ok(Math.abs(generationWaterLitres(338) - 743.6) < 1e-8)
  assert.equal(generationWaterLitres(0), 0)
  assert.throws(() => generationWaterLitres(-1))
  assert.throws(() => generationWaterLitres(Number.NaN))
})

test('overestimated device usage must be corrected before quantified savings are recommended', () => {
  const recommendations = getRecommendations({ ...bill, units: 110, totalPayable: 140 }, [ac])
  assert.equal(recommendations.length, 1)
  assert.equal(recommendations[0].id, 'profile')
  assert.equal(recommendations[0].monthlySavings, 0)
  assert.equal(recommendations[0].action, undefined)
  assert.equal(getRecommendations({ ...bill, units: 0 }, [ac])[0].id, 'profile')
})

test('guided chat extracts quantities, hours, temperature and heating minutes without adding devices', () => {
  const result = guidedReply('2 ACs for 6 hours at 22°C and 3 fans for 10 hours', 0)
  assert.deepEqual(result.devices, [
    { category: 'AC', count: 2, hoursPerDay: 6, setpoint: 22, standby: null },
    { category: 'Fan', count: 3, hoursPerDay: 10, setpoint: null, standby: null },
  ])
  const geyser = guidedReply('1 geyser for 30 minutes off after use', 1)
  assert.equal(geyser.devices[0].hoursPerDay, 0.5)
  assert.equal(geyser.devices[0].standby, false)
  assert.equal(guidedReply('No AC or fans', 0).devices.length, 0)
  assert.equal(guidedReply('I have a fridge', 2).devices[0].hoursPerDay, null)
})

test('AI response validation refuses invented categories, invalid quantities and out-of-range schedules', () => {
  assert.equal(aiReplySchema.safeParse({ reply: 'Hello', devices: [{ category: 'Fan', count: 2, hoursPerDay: 30, setpoint: null, standby: null }] }).success, false)
  assert.equal(aiReplySchema.safeParse({ reply: 'Hello', devices: [{ category: 'Nuclear reactor', count: 1, hoursPerDay: null, setpoint: null, standby: null }] }).success, false)
  assert.equal(aiReplySchema.safeParse({ reply: '', devices: [] }).success, false)
})

test('guided geyser standby is separate from heating and retains comma-separated details', () => {
  assert.deepEqual(guidedReply('Geyser left on all day', 1).devices, [
    { category: 'Geyser', count: 1, hoursPerDay: null, setpoint: null, standby: true },
  ])
  assert.deepEqual(guidedReply('1 geyser for 30 minutes, off after use and 1 fridge on all day', 1).devices, [
    { category: 'Geyser', count: 1, hoursPerDay: 0.5, setpoint: null, standby: false },
    { category: 'Refrigerator', count: 1, hoursPerDay: 24, setpoint: null, standby: null },
  ])
})

test('appliance modeling respects individual AC temperatures, billed days and geyser quantity', () => {
  assert.ok(Math.abs(applianceKwh(ac, {}, 30) - 201.6) < 1e-8)
  assert.equal(applianceKwh({ ...ac, setpoint: 26 }, {}, 30), 180)
  assert.ok(Math.abs(applianceKwh({ ...ac, category: 'Geyser', watts: 2000, hoursPerDay: 0.5, count: 2, standby: true }, {}, 31) - 99.2) < 1e-8)
})

test('simulator preserves uploaded baseline and rolls savings back across the exact slab boundary', () => {
  const source = { ...bill, units: 310 }
  const geyser: Appliance = { ...ac, category: 'Geyser', watts: 2000, hoursPerDay: 0.5, standby: true }
  assert.equal(simulateBill(source, [geyser], {}).projectedAmount, source.totalPayable)
  const changed = simulateBill(source, [geyser], { geyserStandby: false })
  assert.equal(changed.projectedUnits, 292)
  assert.ok(Math.abs(changed.savings - ((10 * (14.55 + 1.5) + 8 * (9.64 + 1.5)) * 1.16)) < 1e-8)
  assert.equal(simulateBill(source, [], { acTemperature: 24, bldcFans: true }).savings, 0)
})

test('recommendation and simulator agree on AC changes, and missing devices never become a fault diagnosis', () => {
  const action = getRecommendations(bill, [ac]).find((item) => item.id === 'ac')
  assert.ok(action)
  assert.ok(Math.abs(action.monthlySavings - simulateBill(bill, [ac], { acTemperature: 24 }).savings) < 1e-8)
  assert.deepEqual(getRecommendations(bill, []), [])
  assert.equal(getRecommendations(bill, [{ ...ac, setpoint: 24 }]).some((item) => item.id === 'ac'), false)
  assert.throws(() => calculateBill(Number.NaN, 'Single phase'))
})
