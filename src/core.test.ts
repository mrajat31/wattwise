import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanNumericCell, compareBills, confirmBill, msedclFieldRegions, parseBillText, validateBillBatch } from './bills.ts'
import { applianceKwh, calculateBill, generationWaterLitres, getRecommendations, getRuntimeSuggestions, getTariff, simulateBill } from './engine.ts'
import { aiReplySchema, guidedReply } from './conversation.ts'
import { appliancePowerPresets, appliancePowerReferences, applianceSchema, approximateWatts, createHome, type Appliance, type Bill, type Workspace } from './data.ts'
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

test('camera OCR mapping skips punctuation, recognizes a shortened status label, and maps consumer values independent of text order', () => {
  const lines = [
    { text: '+ 170012345678', bbox: { x0: 150, y0: 70, x1: 250, y1: 80 } },
    { text: 'ग्राहक क्रमांक', bbox: { x0: 25, y0: 68, x1: 125, y1: 82 } },
    { text: '411048', bbox: { x0: 130, y0: 70, x1: 145, y1: 80 } },
    { text: 'देयक रक्कम रु', bbox: { x0: 550, y0: 140, x1: 650, y1: 160 } },
    { text: '.', bbox: { x0: 655, y0: 145, x1: 660, y1: 150 } },
    { text: '5260.00', bbox: { x0: 695, y0: 142, x1: 740, y1: 155 } },
    { text: 'मागील रिडिंग दिनांक', bbox: { x0: 355, y0: 305, x1: 445, y1: 320 } },
    { text: '10-09-2026', bbox: { x0: 470, y0: 308, x1: 530, y1: 319 } },
    { text: '354', bbox: { x0: 480, y0: 385, x1: 500, y1: 395 } },
    { text: 'Status: Norma]', bbox: { x0: 25, y0: 415, x1: 150, y1: 435 } },
  ]
  const fields = Object.fromEntries(msedclFieldRegions(lines).map(({ label, line }) => [label, line.text]))
  assert.equal(fields['Bill amount'], '5260.00')
  assert.equal(fields['Consumer number'], '+ 170012345678')
  assert.equal(fields['Total consumption'], '354')
})

test('mapped camera consumer number takes precedence over scrambled OCR while an explicitly empty mapping stays missing', () => {
  const text = `BILL OF SUPPLY FOR THE MONTH OF - ऑक्टोबर-2026
    + 170012345678
    ग्राहक क्रमांक
    Total consumption: 354
    Current reading date: 10-10-2026
    Previous reading date: 10-09-2026
    LT I Res 3-Phase
    Mapped bill amount: 5260.00
Mapped consumer number: 170012345678`
  const confirmed = confirmBill(parseBillText(text, 'camera.jpg'))
  assert.equal(confirmed.consumerNumber, '170012345678')
  assert.equal(confirmed.totalPayable, 5260)
  assert.equal(confirmed.units, 354)
  assert.equal(confirmed.billingDays, 30)
  assert.equal(confirmed.fixedCharge, undefined)
  assert.equal(parseBillText(text.replace('Mapped consumer number: 170012345678', 'Mapped consumer number: '), 'camera.jpg').consumerNumber, '')
})

test('camera grid fallback rereads the missing total cell rather than borrowing the visible units or meter readings', () => {
  const lines = [
    { text: 'चालु रिडिंग दिनांक', bbox: { x0: 1071, y0: 1541, x1: 1329, y1: 1580 } },
    { text: '10-10-2026', bbox: { x0: 1439, y0: 1549, x1: 1620, y1: 1582 } },
    { text: 'मागील रिडिंग दिनांक', bbox: { x0: 1069, y0: 1592, x1: 1355, y1: 1635 } },
    { text: '10-09-2026', bbox: { x0: 1436, y0: 1611, x1: 1615, y1: 1645 } },
    { text: '12000', bbox: { x0: 93, y0: 1803, x1: 168, y1: 1828 } },
    { text: '11800', bbox: { x0: 337, y0: 1810, x1: 420, y1: 1836 } },
    { text: '1.00', bbox: { x0: 638, y0: 1823, x1: 699, y1: 1848 } },
    { text: '200', bbox: { x0: 902, y0: 1835, x1: 953, y1: 1860 } },
    { text: 'Status: Normal', bbox: { x0: 121, y0: 1919, x1: 335, y1: 1951 } },
    { text: '150', bbox: { x0: 1450, y0: 2020, x1: 1500, y1: 2040 } },
  ]
  const total = msedclFieldRegions(lines).find((field) => field.label === 'Total consumption')
  assert.ok(total)
  assert.equal(total.line.text, '')
  assert.ok(total.line.bbox.x0 > 1000 && total.line.bbox.x1 <= 1615)
  assert.ok(total.line.bbox.y0 <= 1865 && total.line.bbox.y1 >= 1890)
  assert.ok(total.line.bbox.y1 < 2020)
  assert.equal(msedclFieldRegions(lines.filter((line) => !['12000', '11800'].includes(line.text))).some((field) => field.label === 'Total consumption'), false)
})

test('confirmation rejects bad numbers and invalid months', () => {
  const draft = parseBillText('Bill Month: 10/2026 Billed Units: 338 Net Payable: 4215 Billing Days: 30 Single Phase', 'bill.pdf')
  assert.throws(() => confirmBill({ ...draft, units: '-1' }))
  assert.throws(() => confirmBill({ ...draft, billingDays: '0' }))
  assert.throws(() => confirmBill({ ...draft, billingMonth: '2026-13' }))
})

test('numeric cell cleaning suppresses dotted background and edge-connected grid without erasing interior ink', () => {
  const width = 60
  const height = 40
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const grid = y < 4 || x >= width - 4
      const glyph = x >= 12 && x < 24 && y >= 14 && y < 28
      const value = grid || glyph ? 30 : (x + y) % 2 ? 140 : 110
      const index = (y * width + x) * 4
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value
      pixels[index + 3] = 255
    }
  }
  cleanNumericCell(pixels, width, height)
  assert.equal(pixels[(20 * width + 18) * 4], 0)
  assert.equal(pixels[(2 * width + 30) * 4], 255)
  assert.equal(pixels[(20 * width + 58) * 4], 255)
  assert.equal(pixels[(20 * width + 40) * 4], 255)
  const blank = new Uint8ClampedArray(width * height * 4).fill(255)
  cleanNumericCell(blank, width, height)
  assert.ok(blank.every((value) => value === 255))
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
  assert.ok(recommendations.length > 1)
  assert.equal(recommendations[0].id, 'profile')
  assert.equal(recommendations[0].monthlySavings, 0)
  assert.equal(recommendations[0].action, undefined)
  assert.ok(recommendations.every((item) => item.kwhSaved === 0 && item.monthlySavings === 0 && item.action === undefined))
  assert.ok(recommendations.some((item) => item.id === 'tip-AC'))
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
  assert.ok(changed.savings !== null)
  assert.ok(Math.abs(changed.savings - (10 * 16.64 + 8 * 12.40)) < 1e-8)
  assert.equal(simulateBill(source, [], { acTemperature: 24, bldcFans: true }).savings, 0)
})

test('runtime suggestions use listed active devices without cutting essential or very short runtimes', () => {
  const appliances: Appliance[] = [
    ac,
    { ...ac, id: 'fan', category: 'Fan', watts: 28, hoursPerDay: 8 },
    { ...ac, id: 'computer', category: 'Computer', watts: 200, hoursPerDay: 4 },
    { ...ac, id: 'geyser', category: 'Geyser', hoursPerDay: 0.5 },
    { ...ac, id: 'washer', category: 'Washing machine', hoursPerDay: 0.5 },
    { ...ac, id: 'dishwasher', category: 'Dishwasher', hoursPerDay: 0.7 },
    { ...ac, id: 'fridge', category: 'Refrigerator', hoursPerDay: 24 },
    { ...ac, id: 'router', category: 'Other', name: 'Wi-Fi router', hoursPerDay: 24 },
    { ...ac, id: 'ev', category: 'EV charger', hoursPerDay: 2 },
    { ...ac, id: 'unused', hoursPerDay: 0 },
    { ...ac, id: 'short', category: 'Geyser', hoursPerDay: 5 / 60 },
  ]
  assert.deepEqual(getRuntimeSuggestions(appliances).map((item) => item.applianceId), ['ac', 'fan', 'computer', 'geyser', 'washer', 'dishwasher'])
  assert.deepEqual(getRuntimeSuggestions([]), [])
})

test('per-device hours combine with existing changes without changing another device or saved inventory', () => {
  const secondAc: Appliance = { ...ac, id: 'second-ac', setpoint: 26 }
  const fan: Appliance = { ...ac, id: 'fan', category: 'Fan', watts: 75, hoursPerDay: 8, count: 2 }
  const geyser: Appliance = { ...ac, id: 'geyser', category: 'Geyser', watts: 2000, hoursPerDay: 0.5, standby: true }
  const appliances = [ac, secondAc, fan, geyser]
  const original = structuredClone(appliances)
  const source = { ...bill, units: 600, billingDays: 31 }
  const changed = simulateBill(source, appliances, { acTemperature: 24, bldcFans: true, geyserStandby: false, applianceHours: { ac: 5, fan: 7 } })
  const saved = (applianceKwh(ac, {}, 31) - 155) + (applianceKwh(fan, {}, 31) - 0.028 * 7 * 31 * 2) + 0.6 * 31
  assert.ok(Math.abs(changed.projectedUnits - (source.units - saved)) < 1e-8)
  assert.equal(applianceKwh(secondAc, { applianceHours: { ac: 5 } }, 31), applianceKwh(secondAc, {}, 31))
  assert.equal(applianceKwh(ac, { applianceHours: { ac: 0 } }, 31), 0)
  assert.throws(() => applianceKwh(ac, { applianceHours: { ac: -1 } }))
  assert.throws(() => applianceKwh(ac, { applianceHours: { ac: Number.NaN } }))
  assert.throws(() => applianceKwh(ac, { applianceHours: { ac: 25 } }))
  assert.deepEqual(appliances, original)
  assert.equal(simulateBill(source, appliances, {}).projectedAmount, source.totalPayable)
})

test('personalized runtime recommendations agree with the combined simulator for actual billing days', () => {
  const computer: Appliance = { ...ac, id: 'computer', name: 'Office computer', category: 'Computer', watts: 200, hoursPerDay: 8, count: 2 }
  const washer: Appliance = { ...ac, id: 'washer', category: 'Washing machine', watts: 500, hoursPerDay: 0.5 }
  for (const billingDays of [28, 31]) {
    const source = { ...bill, billingDays }
    const appliances = [computer, washer]
    const recommendations = getRecommendations(source, appliances)
    const runtimeActions = recommendations.filter((item) => typeof item.action === 'object')
    assert.equal(runtimeActions.length, 2)
    const firstSaving = runtimeActions[0].monthlySavings
    const secondSaving = runtimeActions[1].monthlySavings
    assert.ok(firstSaving !== null && secondSaving !== null)
    assert.ok(firstSaving >= secondSaving)
    for (const item of runtimeActions) {
      const action = item.action
      assert.ok(action && typeof action === 'object')
      const result = simulateBill(source, appliances, { applianceHours: { [action.applianceId]: action.hoursPerDay } })
      assert.ok(item.monthlySavings !== null && result.savings !== null)
      assert.ok(Math.abs(item.monthlySavings - result.savings) < 1e-8)
      assert.ok(Math.abs(item.kwhSaved - (source.units - result.projectedUnits)) < 1e-8)
    }
    const computerAction = runtimeActions.find((item) => item.id === 'hours-computer')
    const washerAction = runtimeActions.find((item) => item.id === 'hours-washer')
    assert.ok(computerAction && washerAction)
    assert.ok(Math.abs(computerAction.kwhSaved - 0.2 * 2 * billingDays) < 1e-8)
    assert.ok(Math.abs(washerAction.kwhSaved - 0.5 * 0.55 * 0.5 / 7 * billingDays) < 1e-8)
  }
})

test('maintenance tips match listed devices without inventing savings or simulator actions', () => {
  const fridge: Appliance = { ...ac, id: 'fridge', category: 'Refrigerator', watts: 150, hoursPerDay: 24, annualKwh: 250 }
  const recommendations = getRecommendations(bill, [fridge])
  const tip = recommendations.find((item) => item.id === 'tip-Refrigerator')
  assert.ok(tip)
  assert.equal(tip.monthlySavings, 0)
  assert.equal(tip.kwhSaved, 0)
  assert.equal(tip.action, undefined)
  assert.equal(recommendations.some((item) => item.id.startsWith('hours-') || item.id === 'tip-AC'), false)
})

test('recommendation and simulator agree on AC changes, and missing devices never become a fault diagnosis', () => {
  const action = getRecommendations(bill, [ac]).find((item) => item.id === 'ac')
  assert.ok(action)
  const result = simulateBill(bill, [ac], { acTemperature: 24 })
  assert.ok(action.monthlySavings !== null && result.savings !== null)
  assert.ok(Math.abs(action.monthlySavings - result.savings) < 1e-8)
  assert.deepEqual(getRecommendations(bill, []), [])
  assert.equal(getRecommendations(bill, [{ ...ac, setpoint: 24 }]).some((item) => item.id === 'ac'), false)
  assert.throws(() => calculateBill(Number.NaN, 'Single phase'))
})

test('tariff selection follows government effective periods and never substitutes a current rate for unsupported bills', () => {
  assert.equal(getTariff('2025-06'), null)
  assert.equal(getTariff('2027-04'), null)
  assert.throws(() => getTariff('2026-13'))
  const geyser: Appliance = { ...ac, category: 'Geyser', watts: 2000, hoursPerDay: 0.5, standby: true }
  const source = { ...bill, units: 310 }
  const settings = { geyserStandby: false }
  const older = simulateBill({ ...source, billingMonth: '2022-01' }, [geyser], settings)
  const previousYear = simulateBill({ ...source, billingMonth: '2025-07' }, [geyser], settings)
  const current = simulateBill({ ...source, billingMonth: '2026-04' }, [geyser], settings)
  assert.ok(older.savings !== null && previousYear.savings !== null && current.savings !== null)
  assert.ok(Math.abs(older.savings - (10 * 11.74 + 8 * 8.72)) < 1e-8)
  assert.ok(Math.abs(previousYear.savings - (10 * 16.85 + 8 * 12.57)) < 1e-8)
  assert.ok(Math.abs(current.savings - (10 * 16.64 + 8 * 12.40)) < 1e-8)
  const unknown = simulateBill({ ...source, billingMonth: '2024-10' }, [geyser], settings)
  assert.equal(unknown.projectedUnits, 292)
  assert.equal(unknown.projectedAmount, null)
  assert.equal(unknown.savings, null)
  assert.equal(getRecommendations({ ...source, billingMonth: '2024-10' }, [geyser]).find((item) => item.id === 'geyser')?.monthlySavings, null)
})

test('summer cost changes come from usage and slabs rather than an invented season multiplier', () => {
  const geyser: Appliance = { ...ac, category: 'Geyser', watts: 2000, hoursPerDay: 0.5, standby: true }
  const settings = { geyserStandby: false }
  const april = simulateBill({ ...bill, billingMonth: '2026-04' }, [geyser], settings)
  const november = simulateBill({ ...bill, billingMonth: '2026-11' }, [geyser], settings)
  assert.equal(april.savings, november.savings)
  const lowUsage = simulateBill({ ...bill, units: 90 }, [geyser], settings)
  assert.ok(lowUsage.savings !== null && april.savings !== null)
  assert.ok(april.savings > lowUsage.savings)
})

test('guided chat recognizes backup inverters and Aquaguard purifiers without confusing inverter ACs', () => {
  assert.deepEqual(guidedReply('1 invertor always on and 1 Aquagaurd for 30 minutes daily', 3).devices.map(({ category, hoursPerDay }) => ({ category, hoursPerDay })), [
    { category: 'Inverter', hoursPerDay: 24 },
    { category: 'Water purifier', hoursPerDay: 0.5 },
  ])
  assert.deepEqual(guidedReply('2 inverter ACs for 6 hours', 0).devices.map(({ category, count }) => ({ category, count })), [{ category: 'AC', count: 2 }])
  assert.equal(guidedReply('1 UPS for 24 hours', 3).devices[0].category, 'Inverter')
  assert.equal(guidedReply('1 RO water purifier', 3).devices[0].hoursPerDay, null)
  assert.equal(guidedReply('Aquaguard plugged in all day', 3).devices[0].hoursPerDay, null)
  assert.equal(guidedReply('2 backup inverters always on', 3).devices[0].count, 2)
})

test('purifier active time and inverter extra-loss power use confirmed schedules without cut-runtime suggestions', () => {
  const inverter: Appliance = { ...ac, id: 'inverter', category: 'Inverter', watts: 12, hoursPerDay: 24 }
  const purifier: Appliance = { ...ac, id: 'purifier', category: 'Water purifier', watts: 40, hoursPerDay: 0.5 }
  assert.ok(Math.abs(applianceKwh(inverter, {}, 30) - 8.64) < 1e-8)
  assert.ok(Math.abs(applianceKwh(purifier, {}, 30) - 0.6) < 1e-8)
  assert.deepEqual(getRuntimeSuggestions([inverter, purifier]), [])
  assert.ok(getRecommendations(bill, [inverter, purifier]).some((item) => item.id === 'tip-Water purifier' && item.monthlySavings === 0))
})

test('sourced purifier estimates persist as references and use active time without inventing annual consumption', () => {
  const home = createHome('Reference test')
  home.appliances = appliancePowerReferences.map((reference) => applianceSchema.parse({
    id: reference.id, name: 'Water purifier', category: reference.category, brand: '',
    model: `Approximate reference: ${reference.label}`, watts: reference.watts,
    powerReferenceId: reference.id, hoursPerDay: 0.5, count: 2,
  }))
  const storage = memoryStorage()
  saveWorkspace(storage, { version: 2, name: 'Test', homes: [home], activeHomeId: home.id })
  const saved = loadWorkspace(storage)?.homes[0].appliances
  assert.ok(saved)
  assert.deepEqual(saved, home.appliances)
  for (const appliance of saved) {
    assert.ok(appliance.powerReferenceId)
    assert.equal(appliance.annualKwh, undefined)
    assert.ok(Math.abs(applianceKwh(appliance, {}, 30) - appliance.watts / 1000 * 0.5 * 30 * 2) < 1e-8)
  }
  assert.deepEqual(getRuntimeSuggestions(saved), [])
})

test('power references cannot silently label custom watts or another device category as manufacturer-backed', () => {
  const reference = appliancePowerReferences[1]
  const purifier = { ...ac, category: 'Water purifier', watts: reference.watts, powerReferenceId: reference.id }
  assert.doesNotThrow(() => applianceSchema.parse(purifier))
  assert.throws(() => applianceSchema.parse({ ...purifier, watts: 55 }), /power reference must match/)
  assert.throws(() => applianceSchema.parse({ ...purifier, category: 'Inverter' }), /power reference must match/)
  assert.doesNotThrow(() => applianceSchema.parse({ ...purifier, watts: 55, powerReferenceId: undefined }))
})

test('guided household-device entry keeps quantities and hours without counting tube lights as bulbs', () => {
  const reply = guidedReply('2 LED TVs for 4 hours and 1 soundbar for 2 hours and 4 LED bulbs for 5 hours and 2 LED tube lights for 3 hours and 3 mobile phone chargers for 90 minutes', 3)
  assert.deepEqual(reply.devices.map(({ category, count, hoursPerDay }) => ({ category, count, hoursPerDay })), [
    { category: 'Television', count: 2, hoursPerDay: 4 },
    { category: 'Speaker', count: 1, hoursPerDay: 2 },
    { category: 'Light bulb', count: 4, hoursPerDay: 5 },
    { category: 'Tube light', count: 2, hoursPerDay: 3 },
    { category: 'Mobile charger', count: 3, hoursPerDay: 1.5 },
  ])
  assert.equal(guidedReply('2 fluorescent tube lights for 5 hours', 3).devices.length, 1)
  assert.equal(guidedReply('1 mobile charger plugged in all day', 3).devices[0].hoursPerDay, null)
  assert.equal(guidedReply('1 inverter with 8 hours backup', 3).devices[0].hoursPerDay, null)
  assert.equal(guidedReply('1 backup inverter for 8 hours per day', 3).devices[0].hoursPerDay, 8)
})

test('new household devices with approximate powers persist and contribute actual-schedule kWh to insights', () => {
  const home = createHome('Household defaults')
  const proposals = guidedReply('1 TV for 4 hours and 1 speaker for 2 hours and 4 bulbs for 5 hours and 2 tube lights for 3 hours and 2 phone chargers for 2 hours and 1 inverter always on and 1 water purifier for 30 minutes', 3).devices
  home.appliances = proposals.map((proposal) => applianceSchema.parse({
    category: proposal.category, count: proposal.count, hoursPerDay: proposal.hoursPerDay,
    id: proposal.category, name: proposal.category, brand: '', model: 'Approximate power',
    watts: approximateWatts[proposal.category],
  }))
  const storage = memoryStorage()
  saveWorkspace(storage, { version: 2, name: 'Test', homes: [home], activeHomeId: home.id })
  const saved = loadWorkspace(storage)?.homes[0].appliances
  assert.ok(saved)
  assert.equal(saved.length, 7)
  assert.deepEqual(saved, home.appliances)
  const expectedDaily = [0.4, 0.04, 0.2, 0.12, 0.04, 0.48, 0.02]
  saved.forEach((appliance, index) => {
    assert.ok(Math.abs(applianceKwh(appliance, {}, 1) - expectedDaily[index]) < 1e-8)
    assert.ok(Math.abs(applianceKwh(appliance, {}, 31) - expectedDaily[index] * 31) < 1e-8)
  })
  assert.ok(getRecommendations(bill, saved).some((item) => item.id === 'tip-Television'))
  assert.equal(simulateBill(bill, saved, {}).projectedAmount, bill.totalPayable)
  assert.ok(aiReplySchema.safeParse({ reply: 'Check these devices.', devices: proposals }).success)
})

test('lighting and charging presets model different powers without becoming manufacturer-backed specifications', () => {
  const presets = appliancePowerPresets.filter((item) => ['Light bulb', 'Tube light', 'Mobile charger'].includes(item.category))
  for (const preset of presets) {
    const device = applianceSchema.parse({
      id: preset.id, name: preset.label, category: preset.category, brand: '', model: `Approximate ${preset.label}`,
      watts: preset.watts, hoursPerDay: 5, count: 2,
    })
    assert.equal(device.powerReferenceId, undefined)
    assert.ok(Math.abs(applianceKwh(device, {}, 1) - preset.watts / 1000 * 5 * 2) < 1e-8)
  }
})
