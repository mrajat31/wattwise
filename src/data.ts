import { z } from 'zod'

export const categories = ['AC', 'Fan', 'Geyser', 'Refrigerator', 'Washing machine', 'Dishwasher', 'Induction', 'Computer', 'EV charger', 'Inverter', 'Water purifier', 'Television', 'Speaker', 'Light bulb', 'Tube light', 'Mobile charger', 'Other'] as const

export const approximateWatts: Record<typeof categories[number], number> = {
  AC: 1120, Fan: 75, Geyser: 2000, Refrigerator: 150,
  'Washing machine': 500, Dishwasher: 2000, Induction: 2000, Computer: 150,
  'EV charger': 3300, Inverter: 20, 'Water purifier': 40,
  Television: 100, Speaker: 20, 'Light bulb': 10, 'Tube light': 20,
  'Mobile charger': 10, Other: 60,
}

export const appliancePowerPresets: { id: string; category: typeof categories[number]; label: string; watts: number }[] = [
  { id: 'tv-led', category: 'Television', label: 'LED TV, roughly 43–55 inches', watts: approximateWatts.Television },
  { id: 'tv-large', category: 'Television', label: 'Large TV, roughly 65 inches or above', watts: 170 },
  { id: 'speaker-small', category: 'Speaker', label: 'Small speaker / desktop speakers', watts: approximateWatts.Speaker },
  { id: 'speaker-theatre', category: 'Speaker', label: 'Soundbar / home theatre', watts: 100 },
  { id: 'bulb-led', category: 'Light bulb', label: 'LED bulb', watts: approximateWatts['Light bulb'] },
  { id: 'bulb-cfl', category: 'Light bulb', label: 'CFL bulb', watts: 15 },
  { id: 'bulb-incandescent', category: 'Light bulb', label: 'Older incandescent bulb', watts: 60 },
  { id: 'tube-led', category: 'Tube light', label: 'LED tube / batten', watts: approximateWatts['Tube light'] },
  { id: 'tube-fluorescent', category: 'Tube light', label: 'Older fluorescent tube', watts: 40 },
  { id: 'phone-normal', category: 'Mobile charger', label: 'Regular phone charging', watts: approximateWatts['Mobile charger'] },
  { id: 'phone-fast', category: 'Mobile charger', label: 'Fast phone charging', watts: 25 },
]

export const appliancePowerReferences = [
  {
    id: 'aquaguard-delight-nxt-uv', category: 'Water purifier',
    label: 'UV+UF purifier — Aquaguard Delight NXT', watts: 20,
    source: 'https://www.eurekaforbes.com/media/downloadfiles/usermanual/NXT_RO%2BUV%2BTA.pdf#page=3',
    note: '20 W maximum rating for this UV+UF model. Use as a rough active-use reference only, not a measured value for every purifier.',
  },
  {
    id: 'aquaguard-delight-nxt-ro', category: 'Water purifier',
    label: 'RO+UV / RO+UV+UF purifier — Aquaguard Delight NXT', watts: 40,
    source: 'https://www.eurekaforbes.com/media/downloadfiles/usermanual/NXT_RO%2BUV%2BTA.pdf#page=4',
    note: '40 W maximum rating for the RO variants (manual pages 4 and 6). Use as a rough active-use reference only; actual draw varies.',
  },
  {
    id: 'kent-grand-plus', category: 'Water purifier',
    label: 'Multi-stage RO purifier — KENT Grand Plus', watts: 60,
    source: 'https://www.kent.co.in/products/kent-grand-plus',
    note: '60 W published total power rating for this model. Use active filtering hours; separate standby and in-tank UV consumption are not estimated.',
  },
] as const

export const billSchema = z.object({
  id: z.string().min(1),
  units: z.number().finite().min(0).max(100000),
  phase: z.enum(['Single phase', 'Three phase']),
  fixedCharge: z.number().finite().min(0).optional(),
  billingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  billingDays: z.number().int().min(1).max(90),
  history: z.array(z.number().finite().nonnegative()),
  totalPayable: z.number().finite().nonnegative(),
  source: z.string().min(1),
  consumerNumber: z.string().optional(),
})

export const applianceSchema = z.object({
  id: z.string().min(1),
  catalogId: z.string().optional(),
  name: z.string().min(1).max(120),
  category: z.enum(categories),
  brand: z.string(),
  model: z.string(),
  watts: z.number().finite().min(1).max(30000),
  powerReferenceId: z.enum(appliancePowerReferences.map((reference) => reference.id)).optional(),
  stars: z.number().int().min(0).max(5).optional(),
  beeYear: z.number().int().min(1990).max(2100).optional(),
  iseer: z.number().finite().nonnegative().optional(),
  annualKwh: z.number().finite().nonnegative().optional(),
  hoursPerDay: z.number().finite().min(0).max(24),
  setpoint: z.number().finite().min(18).max(28).optional(),
  standby: z.boolean().optional(),
  count: z.number().int().min(1).max(100),
}).refine((appliance) => !appliance.powerReferenceId || appliancePowerReferences.some((reference) =>
  reference.id === appliance.powerReferenceId && reference.category === appliance.category && reference.watts === appliance.watts
), { message: 'The power reference must match the device category and watts.' })

export type Bill = z.infer<typeof billSchema>
export type Appliance = z.infer<typeof applianceSchema>

export type ApplianceCatalogItem = Omit<Appliance, 'id' | 'hoursPerDay' | 'setpoint' | 'standby' | 'count'> & {
  id: string
  defaultHours: number
  annualKwh: number
}

export const messageSchema = z.object({
  id: z.string(),
  from: z.enum(['assistant', 'user']),
  text: z.string().max(6000),
})
export type ChatMessage = z.infer<typeof messageSchema>

export const homeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  bills: z.array(billSchema),
  appliances: z.array(applianceSchema),
  messages: z.array(messageSchema),
  profileComplete: z.boolean(),
  chatTopic: z.number().int().min(0).max(4),
})
export type Home = z.infer<typeof homeSchema>

export const workspaceSchema = z.object({
  version: z.literal(2),
  name: z.string().min(1).max(60),
  homes: z.array(homeSchema).min(1),
  activeHomeId: z.string(),
})
export type Workspace = z.infer<typeof workspaceSchema>

export function createHome(name: string): Home {
  return { id: crypto.randomUUID(), name, bills: [], appliances: [], messages: [], profileComplete: false, chatTopic: 0 }
}

export const applianceCatalog: ApplianceCatalogItem[] = [
  { id: 'voltas-185v', name: 'Split AC · 1.5 ton inverter', category: 'AC', brand: 'Voltas', model: '185V Vectra Platina', watts: 1120, stars: 5, beeYear: 2021, iseer: 4.55, defaultHours: 6.5, annualKwh: 1250 },
  { id: 'daikin-ftkm', name: 'Split AC · 1.5 ton inverter', category: 'AC', brand: 'Daikin', model: 'FTKM50UV', watts: 1080, stars: 5, beeYear: 2024, iseer: 5.2, defaultHours: 6, annualKwh: 980 },
  { id: 'lg-ts-q19', name: 'Split AC · 1.5 ton inverter', category: 'AC', brand: 'LG', model: 'TS-Q19YNZE', watts: 1050, stars: 5, beeYear: 2023, iseer: 5.0, defaultHours: 5.5, annualKwh: 1010 },
  { id: 'blue-star-ic518', name: 'Split AC · 1.5 ton inverter', category: 'AC', brand: 'Blue Star', model: 'IC518DNU', watts: 1180, stars: 3, beeYear: 2021, iseer: 3.95, defaultHours: 6, annualKwh: 1350 },
  { id: 'voltas-183v', name: 'Split AC · 1.5 ton inverter', category: 'AC', brand: 'Voltas', model: '183V Vectra', watts: 1190, stars: 3, beeYear: 2022, iseer: 3.9, defaultHours: 5, annualKwh: 1280 },
  { id: 'samsung-ar18', name: 'Split AC · 1.5 ton inverter', category: 'AC', brand: 'Samsung', model: 'AR18CYNZ', watts: 1100, stars: 5, beeYear: 2024, iseer: 5.05, defaultHours: 5, annualKwh: 1000 },
  { id: 'lg-window-ac', name: 'Window AC · 1.5 ton', category: 'AC', brand: 'LG', model: 'JW-Q18WUXA', watts: 1650, stars: 3, beeYear: 2022, iseer: 3.45, defaultHours: 5, annualKwh: 1620 },
  { id: 'atomberg-renesa', name: 'Ceiling fan · BLDC 1200mm', category: 'Fan', brand: 'Atomberg', model: 'Renesa+', watts: 28, stars: 5, beeYear: 2023, iseer: 0, defaultHours: 14, annualKwh: 143 },
  { id: 'havells-fhcf', name: 'Ceiling fan · BLDC 1200mm', category: 'Fan', brand: 'Havells', model: 'Stealth Air BLDC', watts: 32, stars: 5, beeYear: 2024, iseer: 0, defaultHours: 13, annualKwh: 152 },
  { id: 'usha-swift', name: 'Ceiling fan · 1200mm', category: 'Fan', brand: 'Usha', model: 'Swift 1200', watts: 75, stars: 3, beeYear: 2021, iseer: 0, defaultHours: 14, annualKwh: 383 },
  { id: 'crompton-energion', name: 'Ceiling fan · 1200mm', category: 'Fan', brand: 'Crompton', model: 'Energion HS', watts: 75, stars: 3, beeYear: 2022, iseer: 0, defaultHours: 12, annualKwh: 329 },
  { id: 'ao-smith-hse', name: 'Storage geyser · 25L', category: 'Geyser', brand: 'AO Smith', model: 'HSE-SDS-025', watts: 2000, stars: 5, beeYear: 2023, iseer: 0, defaultHours: 1.5, annualKwh: 900 },
  { id: 'havells-monza', name: 'Storage geyser · 25L', category: 'Geyser', brand: 'Havells', model: 'Monza EC 25L', watts: 2000, stars: 4, beeYear: 2022, iseer: 0, defaultHours: 1.5, annualKwh: 980 },
  { id: 'racold-pronto', name: 'Instant geyser · 3L', category: 'Geyser', brand: 'Racold', model: 'Pronto Neo', watts: 3000, stars: 5, beeYear: 2024, iseer: 0, defaultHours: 0.6, annualKwh: 560 },
  { id: 'lg-fridge', name: 'Double-door refrigerator · 350L', category: 'Refrigerator', brand: 'LG', model: 'GL-T362', watts: 180, stars: 3, beeYear: 2022, iseer: 0, defaultHours: 8, annualKwh: 310 },
  { id: 'samsung-fridge', name: 'Double-door refrigerator · 345L', category: 'Refrigerator', brand: 'Samsung', model: 'RT37C', watts: 170, stars: 4, beeYear: 2024, iseer: 0, defaultHours: 8, annualKwh: 270 },
  { id: 'whirlpool-fridge', name: 'Double-door refrigerator · 340L', category: 'Refrigerator', brand: 'Whirlpool', model: 'Intellifresh 340', watts: 190, stars: 3, beeYear: 2021, iseer: 0, defaultHours: 8, annualKwh: 335 },
  { id: 'bosch-washer', name: 'Front-load washer · 8kg', category: 'Washing machine', brand: 'Bosch', model: 'WAJ2846', watts: 2000, stars: 5, beeYear: 2023, iseer: 0, defaultHours: 0.7, annualKwh: 95 },
  { id: 'lg-washer', name: 'Front-load washer · 8kg', category: 'Washing machine', brand: 'LG', model: 'FHM1408', watts: 1900, stars: 5, beeYear: 2024, iseer: 0, defaultHours: 0.8, annualKwh: 105 },
  { id: 'bosch-dishwasher', name: 'Dishwasher · 13 place', category: 'Dishwasher', brand: 'Bosch', model: 'SMS66GI01I', watts: 2400, stars: 4, beeYear: 2023, iseer: 0, defaultHours: 0.7, annualKwh: 180 },
  { id: 'lg-dishwasher', name: 'Dishwasher · 14 place', category: 'Dishwasher', brand: 'LG', model: 'DFB532FP', watts: 2200, stars: 4, beeYear: 2024, iseer: 0, defaultHours: 0.8, annualKwh: 190 },
  { id: 'prestige-induction', name: 'Induction cooktop · 2000W', category: 'Induction', brand: 'Prestige', model: 'PIC 20.0', watts: 2000, stars: 0, beeYear: 2024, iseer: 0, defaultHours: 1, annualKwh: 600 },
  { id: 'philips-microwave', name: 'Microwave · 25L convection', category: 'Other', brand: 'Philips', model: 'HD6975', watts: 1400, stars: 0, beeYear: 2023, iseer: 0, defaultHours: 0.4, annualKwh: 170 },
  { id: 'hp-desktop', name: 'Desktop + monitor', category: 'Computer', brand: 'HP', model: 'Pavilion + 24-inch display', watts: 210, stars: 0, beeYear: 2023, iseer: 0, defaultHours: 8, annualKwh: 500 },
  { id: 'dell-desktop', name: 'Desktop + monitor', category: 'Computer', brand: 'Dell', model: 'Inspiron + monitor', watts: 190, stars: 0, beeYear: 2024, iseer: 0, defaultHours: 8, annualKwh: 460 },
  { id: 'tata-ev', name: 'EV home charger · 3.3kW', category: 'EV charger', brand: 'Tata Power', model: 'EZ Charge 3.3kW', watts: 3300, stars: 0, beeYear: 2024, iseer: 0, defaultHours: 1, annualKwh: 990 },
  { id: 'router', name: 'Wi-Fi router', category: 'Other', brand: 'TP-Link', model: 'Archer AX', watts: 12, stars: 0, beeYear: 2023, iseer: 0, defaultHours: 24, annualKwh: 105 },
  { id: 'bajaj-geyser', name: 'Storage geyser · 15L', category: 'Geyser', brand: 'Bajaj', model: 'New Shakti 15L', watts: 2000, stars: 4, beeYear: 2022, iseer: 0, defaultHours: 1.2, annualKwh: 770 },
  { id: 'voltas-1t', name: 'Split AC · 1 ton inverter', category: 'AC', brand: 'Voltas', model: '123V Vectra', watts: 820, stars: 5, beeYear: 2024, iseer: 5.1, defaultHours: 5, annualKwh: 760 },
  { id: 'daikin-1t', name: 'Split AC · 1 ton inverter', category: 'AC', brand: 'Daikin', model: 'FTKF35', watts: 790, stars: 5, beeYear: 2024, iseer: 5.2, defaultHours: 5, annualKwh: 730 },
  { id: 'blue-star-1t', name: 'Split AC · 1 ton inverter', category: 'AC', brand: 'Blue Star', model: 'IC312', watts: 850, stars: 3, beeYear: 2022, iseer: 3.8, defaultHours: 5, annualKwh: 920 },
  { id: 'symphony-cooler', name: 'Personal air cooler', category: 'Other', brand: 'Symphony', model: 'Diet 3D 30i', watts: 145, stars: 0, beeYear: 2024, iseer: 0, defaultHours: 8, annualKwh: 420 },
  { id: 'crompton-bldc', name: 'Ceiling fan · BLDC 1200mm', category: 'Fan', brand: 'Crompton', model: 'SilentPro Enso', watts: 35, stars: 5, beeYear: 2024, iseer: 0, defaultHours: 14, annualKwh: 179 },
  { id: 'whirlpool-washer', name: 'Top-load washer · 7.5kg', category: 'Washing machine', brand: 'Whirlpool', model: 'Stainwash Ultra', watts: 500, stars: 5, beeYear: 2023, iseer: 0, defaultHours: 0.8, annualKwh: 65 },
  { id: 'samsung-washer', name: 'Front-load washer · 8kg', category: 'Washing machine', brand: 'Samsung', model: 'WW80T', watts: 2000, stars: 5, beeYear: 2024, iseer: 0, defaultHours: 0.8, annualKwh: 105 },
]

