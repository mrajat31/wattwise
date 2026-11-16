import { z } from 'zod'
import { categories, type Appliance, type ChatMessage } from './data.ts'

export const deviceProposalSchema = z.object({
  category: z.enum(categories),
  count: z.number().int().min(1).max(100),
  hoursPerDay: z.number().min(0).max(24).nullable(),
  setpoint: z.number().min(18).max(28).nullable(),
  standby: z.boolean().nullable(),
})
export type DeviceProposal = z.infer<typeof deviceProposalSchema>
export const aiReplySchema = z.object({
  reply: z.string().min(1).max(3000),
  devices: z.array(deviceProposalSchema).max(10),
})
export type AiReply = z.infer<typeof aiReplySchema>

export const topics = [
  { label: 'Cooling', question: 'Do you use ACs or fans? Tell me how many and roughly how many hours each runs daily.', chips: ['3 fans for 8 hours a day', '1 AC for 5 hours at 22°C', 'No cooling devices'] },
  { label: 'Hot water', question: 'How do you heat water? If you have a geyser, how long does it run and do you leave it switched on?', chips: ['1 geyser for 30 minutes, off after use', 'Solar hot water, no geyser', 'Geyser left on all day'] },
  { label: 'Kitchen & laundry', question: 'What about your fridge, washing machine, or dishwasher? Tell me the number and daily usage.', chips: ['1 fridge on all day', '1 washing machine for 30 minutes daily', 'No more kitchen devices'] },
  { label: 'Lights & other devices', question: 'Any TVs, speakers, bulbs, tube lights, phone chargers, computers, inverters, or purifiers? Tell me how many and their daily hours. We will suggest approximate watts.', chips: ['1 TV for 4 hours', '4 LED bulbs for 5 hours', '2 mobile chargers for 2 hours', '1 Aquaguard purifier for 30 minutes daily', '1 backup inverter always on', 'That is everything'] },
]

const tubeLightPattern = /\b(?:(?:(?:led|fluorescent)\s+)?tube\s*lights?|fluorescent\s+tubes?|led\s+tubes?|led\s+battens?)\b/i

const aliases: { category: Appliance['category']; expression: RegExp }[] = [
  { category: 'AC', expression: /\b(?:inverter\s+)?(?:acs?|air conditioners?)\b/i },
  { category: 'Fan', expression: /\bfans?\b/i },
  { category: 'Geyser', expression: /\b(?:geysers?|water heaters?)\b/i },
  { category: 'Refrigerator', expression: /\b(?:fridges?|refrigerators?)\b/i },
  { category: 'Washing machine', expression: /\b(?:washing machines?|washers?)\b/i },
  { category: 'Dishwasher', expression: /\bdishwashers?\b/i },
  { category: 'Computer', expression: /\b(?:computers?|desktops?|laptops?)\b/i },
  { category: 'EV charger', expression: /\b(?:ev chargers?|ev charging)\b/i },
  { category: 'Induction', expression: /\binduction(?: cooktops?)?\b/i },
  { category: 'Inverter', expression: /\b(?:(?:backup|home)\s+)?(?:inverters?|invertors?|ups)\b(?!\s*(?:acs?\b|air\s*conditioners?\b))/i },
  { category: 'Water purifier', expression: /\b(?:water\s*purifiers?|aquaguard|aquagaurd|aqua\s*guard|ro(?:\s*purifiers?)?|uv\s*purifiers?)\b/i },
  { category: 'Television', expression: /\b(?:(?:smart|led|oled|qled)\s+)?(?:tvs?|televisions?)\b/i },
  { category: 'Speaker', expression: /\b(?:(?:bluetooth\s+)?speakers?|sound\s*bars?|home\s+theat(?:re|er)s?)\b/i },
  { category: 'Tube light', expression: tubeLightPattern },
  { category: 'Light bulb', expression: /\b(?:(?:led|cfl|incandescent)\s+)?(?:bulbs?|lights?|lamps?)\b/i },
  { category: 'Mobile charger', expression: /\b(?:(?:mobile|smartphone|usb)\s+(?:phone\s+)?chargers?|phone\s+chargers?|charging\s+(?:mobiles?|phones?))\b/i },
]

export function guidedReply(text: string, topic: number): AiReply {
  const devices: DeviceProposal[] = []
  const clauses: string[] = []
  for (const clause of text.split(/\s+(?:and|also)\s+|[,;]/i)) {
    if (clauses.length && !aliases.some((alias) => alias.expression.test(clause))) {
      clauses[clauses.length - 1] += ` ${clause}`
    } else {
      clauses.push(clause)
    }
  }
  for (const clause of clauses) {
    for (const alias of aliases) {
      const match = alias.expression.exec(alias.category === 'Light bulb'
        ? clause.replace(tubeLightPattern, (value) => ' '.repeat(value.length))
        : clause)
      if (!match || /\b(?:no|without|don't have|do not have|solar)\b/i.test(clause)) continue
      const count = Number(clause.slice(0, match.index).match(/(\d+)\s*$/)?.[1] ?? 1)
      const hours = clause.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|\bh\b)/i)?.[1]
      const minutes = clause.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)/i)?.[1]
      const allDay = /all day|24\/7|always on/i.test(clause)
      const backupCapacity = alias.category === 'Inverter' && hours && /\bbackup\b/i.test(clause)
        && !/\b(?:daily|per day|a day|each day)\b/i.test(clause)
      const temperature = clause.match(/(?:at\s*)?(\d{2})\s*(?:°\s*c|degrees?|c\b)/i)?.[1]
      const standby = alias.category === 'Geyser'
        ? /left on|leave.*on|all day|standby/i.test(clause) ? true : /off|after use|timer/i.test(clause) ? false : null
        : null
      const proposal = deviceProposalSchema.safeParse({
        category: alias.category, count,
        hoursPerDay: hours && !backupCapacity ? Number(hours) : minutes ? Number(minutes) / 60 : allDay && !['Geyser', 'Water purifier', 'Mobile charger'].includes(alias.category) ? 24 : null,
        setpoint: temperature ? Number(temperature) : null, standby,
      })
      if (proposal.success) devices.push(proposal.data)
    }
  }
  return {
    reply: devices.length
      ? 'I picked out these devices. Please check the quantity, hours, and power below before adding them. Approximate is fine.'
      : /\b(?:no|none|everything|solar)\b/i.test(text)
        ? 'Got it. You can go to the next topic, add another device, or finish your list.'
        : `I can help record your devices in guided mode. ${topics[Math.min(topic, 3)].question} For open-ended questions, enable private AI.`,
    devices,
  }
}

export const replyJsonSchema = {
  type: 'object', additionalProperties: false, required: ['reply', 'devices'],
  properties: {
    reply: { type: 'string' },
    devices: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['category', 'count', 'hoursPerDay', 'setpoint', 'standby'],
        properties: {
          category: { type: 'string', enum: [...categories] },
          count: { type: 'integer', minimum: 1, maximum: 100 },
          hoursPerDay: { type: ['number', 'null'], minimum: 0, maximum: 24 },
          setpoint: { type: ['number', 'null'], minimum: 18, maximum: 28 },
          standby: { type: ['boolean', 'null'] },
        },
      },
    },
  },
}

export function aiSystemPrompt(appliances: Appliance[], topic: number): string {
  return `You are WattWise, a friendly home electricity assistant in Pune. Speak in short, simple English, at most 3 sentences. Ask one question at a time.
Current topic: ${topics[Math.min(topic, 3)].question}
Confirmed devices: ${JSON.stringify(appliances.map(({ category, count, hoursPerDay, setpoint, standby }) => ({ category, count, hoursPerDay, setpoint, standby })))}
Return JSON with reply and devices. Devices are proposals from the LAST user message only, never repeat the confirmed list. Do not claim they are saved until the user confirms.
Use only these categories: ${categories.join(', ')}. Never invent a user's appliances or exact brand/model specs. Use null for hours, temperature and standby when not stated. Convert minutes to hours. Fridge on all day means 24 hours. Geyser heating runtime is separate from leaving standby on. Inverter means battery-backup/UPS, not an inverter AC; battery backup duration is not daily running hours. Aquaguard, RO and UV water purifiers use Water purifier; ask for active filtering hours, not just time plugged in. TVs use Television, soundbars/home theatres use Speaker, bulbs use Light bulb, tube lights/battens use Tube light, and phone chargers use Mobile charger. Phone charger hours mean active charging, not time plugged in. The device editor provides editable approximate watts, including an assumed inverter extra-loss allowance, not output VA or full charging power. If the user has no device return devices: [].
Do not calculate rupee savings or bills: a separate deterministic calculator handles that. Do not diagnose hardware faults from incomplete usage. Do not recommend electrical wiring work. Stay on home energy; refuse unrelated requests briefly.`
}

export function conversationContext(messages: ChatMessage[]) {
  return messages.slice(-8).map((message) => ({
    role: message.from === 'assistant' ? 'assistant' as const : 'user' as const,
    content: message.text,
  }))
}
