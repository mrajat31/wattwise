import { billSchema, type Bill } from './data.ts'
import type { ImageLike } from 'tesseract.js'

export const billLanguages = [
  { code: 'mar', label: 'Marathi' },
  { code: 'eng', label: 'English' },
  { code: 'hin', label: 'Hindi' },
] as const
export type BillLanguage = typeof billLanguages[number]['code']

export type BillDraft = {
  id: string
  source: string
  units: string
  totalPayable: string
  billingMonth: string
  billingDays: string
  phase: '' | Bill['phase']
  fixedCharge: string
  consumerNumber: string
  warning: string
}

function extractNumber(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match?.[1]) return match[1].replace(/,/g, '')
  }
  return ''
}

function normalizeBillText(text: string): string {
  return text.normalize('NFC').replace(/[\u200c\u200d]/g, '')
    .replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x0966))
    .replace(/[ \t]+/g, ' ')
}

const amountPatterns = [
  /(?:net\s*payable|amount\s*payable|total\s*payable|bill\s*amount)\s*[:-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)/i,
  /देयक\s*रक्?कम\s*(?:रु\.?|रू\.?|रुपये|₹)?\s*[:-]?\s*([\d,]+(?:\.\d+)?)/,
  /(?:कुल\s*देय\s*राशि|देय\s*राशि|बिल\s*राशि)\s*[:-]?\s*(?:₹|रु\.?|रू\.?|रुपये|rs\.?)?\s*([\d,]+(?:\.\d+)?)/i,
]

export function extractMonth(text: string): string {
  const labelled = normalizeBillText(text).match(/(?:bill(?:ing)?\s*month|bill\s*period|month(?:\s*of)?|देयक\s*महिना|बिल\s*(?:का\s*)?(?:महीना|माह)|बिलिंग\s*माह)\s*[:-]?\s*([^\n]{3,45})/i)?.[1] ?? ''
  const iso = labelled.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}`
  const numeric = labelled.match(/\b(0?[1-9]|1[0-2])[-/](20\d{2})\b/)
  if (numeric) return `${numeric[2]}-${numeric[1].padStart(2, '0')}`
  const named = labelled.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s/-]+(20\d{2})\b/i)
  if (named) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(named[1].slice(0, 3).toLowerCase()) + 1
    return `${named[2]}-${String(month).padStart(2, '0')}`
  }
  const localMonths = [
    'जानेवारी|जनवरी', 'फेब्रुवारी|फरवरी|फ़रवरी', 'मार्च', 'एप्रिल|अप्रैल',
    'मे|मई', 'जून', 'जुलै|जुलाई', 'ऑगस्ट|अगस्त', 'सप्टेंबर|सितंबर|सितम्बर',
    'ऑक्टोबर|अक्टूबर', 'नोव्हेंबर|नवंबर|नवम्बर', 'डिसेंबर|दिसंबर|दिसम्बर',
  ]
  for (const [index, month] of localMonths.entries()) {
    const match = new RegExp(`(?:${month.normalize('NFC')})[\\s/-]+(20\\d{2})`).exec(labelled)
    if (match) return `${match[1]}-${String(index + 1).padStart(2, '0')}`
  }
  return ''
}

function readingDate(text: string, labels: RegExp[]): number | null {
  for (const label of labels) {
    const value = label.exec(text)?.[1]?.trim()
    if (!value) continue
    // A printed colon is sometimes read as a leading 1, and a faint day/month dash can disappear.
    const match = value.match(/^1?(\d{2})[-/.](\d{2})[-/.](20\d{2})$/)
      ?? value.match(/^1(\d{2})(\d{2})[-/.](20\d{2})$/)
    if (!match) continue
    const [, day, month, year] = match
    const date = Date.UTC(Number(year), Number(month) - 1, Number(day))
    const checked = new Date(date)
    if (checked.getUTCDate() === Number(day) && checked.getUTCMonth() === Number(month) - 1) return date
  }
  return null
}

export function parseBillText(text: string, source: string): BillDraft {
  const normalized = normalizeBillText(text)
  const meterTable = normalized.match(/गुणक\s*अवयव\s+युनिट\s+(?:समा\.?\s*युनिट|समायोजित\s*युनिट)\s+एक[ूुृ]?ण\s*वापर\s*[:|]?\s*(?:[\d,]+(?:\.\d+)?\s+){5}([\d,]+(?:\.\d+)?)/)
  const units = meterTable?.[1]?.replace(/,/g, '') ?? extractNumber(normalized, [
    /(?:billed\s*units|units\s*billed|total\s*(?:consumption|units))\s*[:-]?\s*(?:kwh)?\s*([\d,]+(?:\.\d+)?)/i,
    /(?:consumption|units\s*consumed)\s*[:-]?\s*([\d,]+(?:\.\d+)?)/i,
    /(?:एक[ूुृ]?ण\s*वापर|वापरलेले\s*युनिट)\s*[:-]?\s*([\d,]+(?:\.\d+)?)/,
    /(?:कुल\s*(?:खपत|यूनिट|इकाइयाँ|इकाइयां))\s*[:-]?\s*(?:kwh)?\s*([\d,]+(?:\.\d+)?)/i,
  ])
  const mappedAmount = normalized.match(/^Mapped bill amount:[ \t]*([^\n]*)$/m)
  const totalPayable = mappedAmount ? extractNumber(mappedAmount[1], [/^(\d+(?:\.\d+)?)$/]) : extractNumber(normalized, amountPatterns)
  let billingDays = extractNumber(normalized, [/(?:billing\s*days|bill(?:ing)?\s*period\s*(?:in\s*)?days|no\.?\s*of\s*days|बिलिंग\s*(?:दिवस|दिन))\s*[:-]?\s*(\d{1,2})/i])
  const current = readingDate(normalized, [
    /current\s*reading\s*date\s*[:-]?\s*([0-9./-]+)/i,
    /चाल[ुू]\s*(?:रिडिंग|रीडिंग|वाचन)\s*दिनांक\s*[:-]?\s*([0-9./-]+)/,
    /वर्तमान\s*(?:मीटर\s*)?रीडिंग\s*(?:तिथि|दिनांक)\s*[:-]?\s*([0-9./-]+)/,
  ])
  const previous = readingDate(normalized, [
    /previous\s*reading\s*date\s*[:-]?\s*([0-9./-]+)/i,
    /मागील\s*(?:रिडिंग|रीडिंग|वाचन)\s*दिनांक\s*[:-]?\s*([0-9./-]+)/,
    /पिछली\s*(?:मीटर\s*)?रीडिंग\s*(?:तिथि|दिनांक)\s*[:-]?\s*([0-9./-]+)/,
  ])
  const readingDays = current !== null && previous !== null ? (current - previous) / 86400000 : 0
  const derivedDays = !billingDays && readingDays >= 1 && readingDays <= 90
  if (derivedDays) billingDays = String(readingDays)
  const fixedCharge = extractNumber(normalized, [/(?:fixed\s*charg(?:e|es)|स्थिर\s*(?:आकार|शुल्क)|निश्चित\s*(?:आकार|शुल्क)|नियत\s*शुल्क|स्थायी\s*शुल्क)\s*[:-]?\s*(?:₹|rs\.?|inr|रु\.?|रू\.?)?\s*([\d,]+(?:\.\d+)?)/i])
  const consumerNumber = normalized.match(/(?:consumer\s*(?:no\.?|number)|[गह]्राहक\s*(?:क्रमांक|क्र\.?|संख्या|नंबर)|उपभोक्ता\s*(?:संख्या|क्रमांक|नंबर))\s*[:-]?\s*(\d{8,15})(?!\d)/i)?.[1] ?? ''
  const phase = /(?:3|three|तीन|थ्री)[ -]?(?:phase|फेज़?|फेज़)/i.test(normalized)
    ? 'Three phase' : /(?:1|single|एक|सिंगल)[ -]?(?:phase|फेज़?|फेज़)/i.test(normalized) ? 'Single phase' : ''
  return {
    id: crypto.randomUUID(), source, units, totalPayable, billingMonth: extractMonth(normalized),
    billingDays, phase, fixedCharge, consumerNumber,
    warning: [
      !units || !totalPayable ? 'Some fields could not be read. Please copy the missing details from this bill.' : 'Please check the extracted details against your bill before saving.',
      derivedDays ? 'Billing days were calculated between the previous and current meter-reading dates; please verify both dates on your bill.' : '',
      !fixedCharge ? 'Fixed charge was not found. Leave it blank or upload the charge-breakdown page; early/late payment amounts are not fixed charges.' : '',
    ].filter(Boolean).join(' '),
  }
}

type OcrLine = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }

export function msedclFieldRegions(lines: OcrLine[], words: OcrLine[] = lines) {
  const fields: { label: string; line: OcrLine }[] = []
  const labels = [
    { label: 'Bill amount', pattern: /net\s*payable|amount\s*payable|total\s*payable|bill\s*amount|देयक\s*रक्?कम|देय\s*राशि|बिल\s*राशि/i, below: false },
    { label: 'Total consumption', pattern: /एक[ूुृ]?ण\s*वापर|कुल\s*(?:खपत|यूनिट)|total\s*(?:consumption|units)/i, below: true },
    { label: 'Current reading date', pattern: /चाल[ुू]\s*(?:रिडिंग|रीडिंग|वाचन)\s*दिनांक|वर्तमान\s*(?:मीटर\s*)?रीडिंग\s*(?:तिथि|दिनांक)|current\s*reading\s*date/i, below: false },
    { label: 'Previous reading date', pattern: /मागील\s*(?:रिडिंग|रीडिंग|वाचन)\s*दिनांक|पिछली\s*(?:मीटर\s*)?रीडिंग\s*(?:तिथि|दिनांक)|previous\s*reading\s*date/i, below: false },
  ]
  for (const { label, pattern, below } of labels) {
    const header = lines.find((line) => pattern.test(normalizeBillText(line.text)))
    if (!header) continue
    const box = header.bbox
    const height = box.y1 - box.y0
    const candidates = (below ? words : lines).filter((line) => {
      if (!/^[\d,./:\s-]+$/.test(normalizeBillText(line.text))) return false
      const value = line.bbox
      const centerX = (value.x0 + value.x1) / 2
      return below
        ? centerX >= box.x0 && centerX <= box.x1 && value.y0 >= box.y1 && value.y0 - box.y1 < height * 2
        : value.x0 >= box.x1 && value.x0 - box.x1 < height * 12 && value.y0 < box.y1 && value.y1 > box.y0
    }).sort((a, b) => below ? a.bbox.y0 - b.bbox.y0 : a.bbox.x0 - b.bbox.x0)
    if (candidates[0]) {
      fields.push({ label, line: candidates[0] })
    } else if (label === 'Bill amount') {
      const inline = extractNumber(normalizeBillText(header.text), amountPatterns)
      const value = inline && words.find((word) => normalizeBillText(word.text).trim().replace(/,/g, '') === inline
        && word.bbox.y0 < box.y1 && word.bbox.y1 > box.y0 && word.bbox.x0 >= box.x0 && word.bbox.x1 <= box.x1)
      if (value) fields.push({ label, line: value })
    }
  }
  if (!fields.some((field) => field.label === 'Total consumption')) {
    const reading = fields.find((field) => field.label === 'Previous reading date')?.line.bbox
    const status = lines.find((line) => /meter\s*status/i.test(line.text))?.bbox
    if (reading && status) {
      // Grid lines can hide this legacy MSEDCL header. Its total is above Meter Status,
      // in the rightmost table column, aligned with the reading-date values.
      const candidates = words.filter((word) => {
        const box = word.bbox
        const center = (box.x0 + box.x1) / 2
        return /^\d+(?:\.\d+)?$/.test(normalizeBillText(word.text).trim())
          && center >= reading.x0 && center <= reading.x1
          && box.y0 > reading.y1 && box.y1 < status.y0
          && status.y0 - box.y1 < (status.y1 - status.y0) * 4
      }).sort((a, b) => b.bbox.y1 - a.bbox.y1)
      if (candidates[0]) fields.push({ label: 'Total consumption', line: candidates[0] })
    }
  }
  return fields
}

export async function recognizeBillImage(image: ImageLike, language: BillLanguage = 'mar'): Promise<string> {
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker(language === 'eng' ? ['eng'] : ['eng', language])
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true })
    if (data.text.trim().length < 10) throw new Error('The photo could not be read. Please enter its details or upload a clearer photo.')
    const texts = [data.text]
    if (/महावितरण|mahadiscom|bill of supply/i.test(data.text)) {
      const lines = data.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines)) ?? []
      const words = lines.flatMap((line) => line.words)
      let mappedAmount = ''
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: '0123456789-/.' })
      for (const { label, line } of msedclFieldRegions(lines, words)) {
        const box = line.bbox
        const { data: refined } = await worker.recognize(image, { rectangle: {
          left: Math.max(0, box.x0 - 4), top: Math.max(0, box.y0 - 4),
          width: box.x1 - box.x0 + 8, height: box.y1 - box.y0 + 8,
        } })
        if (label === 'Bill amount') mappedAmount = refined.text.trim()
        else if (refined.text.trim()) texts.push(`${label}: ${refined.text.trim()}`)
      }
      texts.push(`Mapped bill amount: ${mappedAmount}`)
    }
    return texts.join('\n')
  } finally {
    await worker.terminate()
  }
}

function prepareOcrCanvas(image: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const scale = Math.min(3, 2400 / width, Math.sqrt(12000000 / (width * height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare the bill image for reading.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  let darkest = 255
  let lightest = 0
  for (let index = 0; index < pixels.data.length; index += 4) {
    const grey = Math.round(pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114)
    pixels.data[index] = grey
    darkest = Math.min(darkest, grey)
    lightest = Math.max(lightest, grey)
  }
  for (let index = 0; index < pixels.data.length; index += 4) {
    const grey = lightest > darkest ? Math.round((pixels.data[index] - darkest) * 255 / (lightest - darkest)) : pixels.data[index]
    pixels.data[index] = grey
    pixels.data[index + 1] = grey
    pixels.data[index + 2] = grey
  }
  context.putImageData(pixels, 0, 0)
  return canvas
}

export function confirmBill(draft: BillDraft): Bill {
  if ([draft.units, draft.totalPayable, draft.billingMonth, draft.billingDays, draft.phase].some((value) => value.trim() === '')) {
    throw new Error('Please enter the month, units, bill amount, billing days, and connection phase shown on the bill.')
  }
  return billSchema.parse({
    ...draft, units: Number(draft.units), totalPayable: Number(draft.totalPayable),
    billingDays: Number(draft.billingDays), fixedCharge: draft.fixedCharge === '' ? undefined : Number(draft.fixedCharge),
    consumerNumber: draft.consumerNumber || undefined, history: [],
  })
}

export function validateBillBatch(bills: Bill[], existing: Bill[]): void {
  const seenMonths = new Set(existing.map((bill) => bill.billingMonth))
  const consumerNumbers = new Set([...existing, ...bills].map((bill) => bill.consumerNumber).filter(Boolean))
  if (consumerNumbers.size > 1) throw new Error('These bills contain different consumer numbers. Save bills for another connection in a separate home.')
  for (const bill of bills) {
    if (seenMonths.has(bill.billingMonth)) throw new Error(`A bill for ${bill.billingMonth} is already saved or appears twice. Keep one bill per month for this home.`)
    seenMonths.add(bill.billingMonth)
  }
}

export function compareBills(earlier: Bill, later: Bill) {
  return {
    amountDifference: later.totalPayable - earlier.totalPayable,
    unitDifference: later.units - earlier.units,
    dailyUnitDifference: later.units / later.billingDays - earlier.units / earlier.billingDays,
    percentChange: earlier.totalPayable > 0 ? ((later.totalPayable - earlier.totalPayable) / earlier.totalPayable) * 100 : null,
  }
}

export async function readBillFile(file: File, language: BillLanguage = 'mar'): Promise<string> {
  if (file.size > 15 * 1024 * 1024) throw new Error('This file is larger than 15 MB. Please upload a smaller PDF or image.')
  if (/\.pdf$/i.test(file.name)) {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() })
    try {
      const pdfDocument = await loadingTask.promise
      if (pdfDocument.numPages > 20) throw new Error('Please upload a bill with no more than 20 pages.')
      const texts: string[] = []
      for (let index = 1; index <= pdfDocument.numPages; index += 1) {
        const page = await pdfDocument.getPage(index)
        const content = await page.getTextContent()
        const pageText = content.items.map((item) => 'str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : '').join('')
        if (pageText.trim().length >= 20) {
          texts.push(pageText)
        } else {
          const size = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: Math.min(2, 2400 / size.width, Math.sqrt(12000000 / (size.width * size.height))) })
          const canvas = document.createElement('canvas')
          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          const context = canvas.getContext('2d')
          if (!context) throw new Error('This browser cannot read scanned PDF pages.')
          await page.render({ canvas, canvasContext: context, viewport }).promise
          texts.push(await recognizeBillImage(prepareOcrCanvas(canvas, canvas.width, canvas.height), language))
        }
      }
      const text = texts.join('\n')
      return text
    } finally {
      await loadingTask.destroy()
    }
  }
  if (!/\.(?:png|jpe?g)$/i.test(file.name)) throw new Error('Please upload a PDF, JPG, or PNG file.')
  const image = await createImageBitmap(file)
  try {
    return await recognizeBillImage(prepareOcrCanvas(image, image.width, image.height), language)
  } finally {
    image.close()
  }
}
