import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Check, FileText, LoaderCircle, Plus, Trash2, Upload, X } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Home } from './data'
import { billLanguages, compareBills, confirmBill, parseBillText, readBillFile, validateBillBatch, type BillDraft, type BillLanguage } from './bills'
import { currency, monthLabel } from './format'

type Props = { home: Home; onChange: (update: (home: Home) => Home) => void; onBlocking: (blocking: boolean) => void }

export default function BillsPanel({ home, onChange, onBlocking }: Props) {
  const [drafts, setDrafts] = useState<BillDraft[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [language, setLanguage] = useState<BillLanguage>('mar')
  const sorted = [...home.bills].sort((a, b) => a.billingMonth.localeCompare(b.billingMonth))
  const [billAId, setBillAId] = useState('')
  const [billBId, setBillBId] = useState('')
  const billA = sorted.find((bill) => bill.id === billAId) ?? sorted.at(-2)
  const billB = sorted.find((bill) => bill.id === billBId) ?? sorted.at(-1)
  const comparison = billA && billB && billA.id !== billB.id ? compareBills(billA, billB) : null

  const upload = async (files: File[]) => {
    if (!files.length) return
    if (files.length > 10) { setError('Please select up to 10 bills per upload. None of these files were read.'); return }
    setError(''); setSuccess(''); setBusy(true); onBlocking(true)
    const results: BillDraft[] = []
    try {
      for (const [index, file] of files.entries()) {
        setStatus(`Reading bill ${index + 1} of ${files.length}: ${file.name}`)
        try {
          results.push(parseBillText(await readBillFile(file, language), file.name))
        } catch (failure) {
          const draft = parseBillText('', file.name)
          results.push({ ...draft, warning: failure instanceof Error ? failure.message : 'This file could not be read. Please enter its details.' })
        }
      }
      setDrafts(results)
    } finally { setBusy(false); setStatus('') }
  }

  const save = () => {
    try {
      const bills = drafts.map(confirmBill)
      validateBillBatch(bills, home.bills)
      onChange((current) => ({ ...current, bills: [...current.bills, ...bills].sort((a, b) => a.billingMonth.localeCompare(b.billingMonth)) }))
      setSuccess(`${bills.length} ${bills.length === 1 ? 'bill' : 'bills'} saved for ${home.name}.`)
      setDrafts([]); setError(''); onBlocking(false)
    } catch (failure) {
      setError(failure instanceof Error && !failure.message.startsWith('[') ? failure.message : 'Please check the bill fields: non-negative units/amount, valid month, and 1–90 billing days.')
    }
  }
  const clearDrafts = () => { setDrafts([]); setError(''); onBlocking(false) }
  const editDraft = (id: string, key: keyof BillDraft, value: string) => {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, [key]: value } : draft))
  }

  return (
    <section className="bills-panel">
      <div className="section-heading"><div><h2>{home.bills.length ? 'Your bills, all in one place' : 'Start with your electricity bill'}</h2><p>Upload the MSEDCL bill for <strong>{home.name}</strong>. Multiple months? Select them together.</p></div><span className="badge"><FileText size={14} /> {home.bills.length} saved</span></div>
      <div className="bill-language"><label>Bill language<select value={language} disabled={busy || drafts.length > 0} onChange={(event) => {
        const selected = billLanguages.find((item) => item.code === event.target.value)
        if (selected) setLanguage(selected.code)
      }}>{billLanguages.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><p>Choose the printed language before uploading. English labels are also recognized. All three languages map to the same fields below.</p></div>
      {!drafts.length && <label className={`upload-zone ${busy ? 'disabled' : ''}`}>
        <span className="upload-icon">{busy ? <LoaderCircle className="spin" size={27} /> : <Upload size={27} />}</span>
        <strong>{busy ? 'Reading your bills…' : 'Choose your Pune electricity bills'}</strong>
        <span>PDF, JPG or PNG · up to 10 files · 15 MB each</span>
        <span className="button primary"><Plus size={16} /> Choose bills</span>
        <input aria-label="Upload electricity bills" type="file" multiple accept=".pdf,.png,.jpg,.jpeg" disabled={busy} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void upload(files) }} />
      </label>}
      <p className="privacy-caption">Files are read on this device. Check every bill before saving; no amount or date is invented.</p>
      {busy && <p className="notice" role="status">{status}</p>}
      {error && <div className="alert" role="alert">{error}</div>}
      {success && <p className="success-note" role="status"><Check size={16} />{success}</p>}
      {!!drafts.length && <div className="review-bills"><div className="section-heading"><div><h3>Check the details from each bill</h3><p>Missing fields stay blank. Please fill them from the original bill.</p></div><button className="text-button" onClick={clearDrafts}>Cancel upload</button></div>
        {drafts.map((draft, index) => <article className="bill-review" key={draft.id}>
          <div className="section-heading"><h3>{index + 1}. {draft.source}</h3><button className="icon-button" aria-label={`Remove ${draft.source} from upload`} onClick={() => {
            const remaining = drafts.filter((item) => item.id !== draft.id); setDrafts(remaining); if (!remaining.length) onBlocking(false)
          }}><X size={18} /></button></div>
          <p className="notice">{draft.warning}</p>
          <div className="form-grid">
            <label>Bill month<input aria-label={`Bill month for ${draft.source}`} type="month" required value={draft.billingMonth} onChange={(event) => editDraft(draft.id, 'billingMonth', event.target.value)} /></label>
            <label>Electricity used (units / kWh)<input aria-label={`Units for ${draft.source}`} type="number" min="0" step="any" required value={draft.units} onChange={(event) => editDraft(draft.id, 'units', event.target.value)} /></label>
            <label>Bill amount (₹)<input aria-label={`Amount for ${draft.source}`} type="number" min="0" step="any" required value={draft.totalPayable} onChange={(event) => editDraft(draft.id, 'totalPayable', event.target.value)} /></label>
            <label>Billing days<input aria-label={`Billing days for ${draft.source}`} type="number" min="1" max="90" required value={draft.billingDays} onChange={(event) => editDraft(draft.id, 'billingDays', event.target.value)} /></label>
            <label>Connection phase<select aria-label={`Phase for ${draft.source}`} required value={draft.phase} onChange={(event) => editDraft(draft.id, 'phase', event.target.value)}><option value="">Check your bill</option><option>Single phase</option><option>Three phase</option></select></label>
            <label>Fixed charge (₹, optional)<input aria-label={`Fixed charge for ${draft.source}`} type="number" min="0" step="any" value={draft.fixedCharge} placeholder="Leave blank if unreadable" onChange={(event) => editDraft(draft.id, 'fixedCharge', event.target.value)} /></label>
            <label className="wide">Consumer number (optional, helps separate homes)<input aria-label={`Consumer number for ${draft.source}`} value={draft.consumerNumber} onChange={(event) => editDraft(draft.id, 'consumerNumber', event.target.value)} /></label>
          </div>
        </article>)}
        <button className="button primary" onClick={save}><Check size={17} /> Confirm and save {drafts.length} {drafts.length === 1 ? 'bill' : 'bills'}</button>
      </div>}
      {sorted.length >= 2 && <section className="comparison-panel">
        <div className="section-heading"><div><h2>Did your bill go up or down?</h2><p>Compare two uploaded bills for this home.</p></div></div>
        <div className="comparison-selectors"><label>Bill A<select aria-label="Comparison bill A" value={billA?.id ?? ''} onChange={(event) => setBillAId(event.target.value)}>{sorted.map((bill) => <option key={bill.id} value={bill.id}>{monthLabel(bill.billingMonth)} · {currency(bill.totalPayable)}</option>)}</select></label><label>Bill B<select aria-label="Comparison bill B" value={billB?.id ?? ''} onChange={(event) => setBillBId(event.target.value)}>{sorted.map((bill) => <option key={bill.id} value={bill.id}>{monthLabel(bill.billingMonth)} · {currency(bill.totalPayable)}</option>)}</select></label></div>
        {comparison && billA && billB ? <>
          <div className="comparison-summary">{comparison.amountDifference <= 0 ? <ArrowDownRight size={24} /> : <ArrowUpRight size={24} />}<div><strong>{comparison.amountDifference === 0 ? 'Your bill amount stayed the same' : `Bill B is ${currency(Math.abs(comparison.amountDifference))} ${comparison.amountDifference > 0 ? 'higher' : 'lower'}`}</strong><p>{comparison.percentChange === null ? 'The earlier bill was ₹0, so a percentage change is not available.' : `${Math.abs(comparison.percentChange).toFixed(1)}% ${comparison.amountDifference >= 0 ? 'increase' : 'decrease'} in the total amount.`} {Math.abs(comparison.unitDifference).toFixed(1)} {comparison.unitDifference >= 0 ? 'more' : 'fewer'} units used.</p></div></div>
          <p className="notice">{billA.billingDays !== billB.billingDays ? `The bills cover ${billA.billingDays} and ${billB.billingDays} days. ` : ''}Daily use: {(billA.units / billA.billingDays).toFixed(1)} → {(billB.units / billB.billingDays).toFixed(1)} units/day. Amount changes can also include tariff changes, adjustments, or arrears—not just appliance use.</p>
        </> : <p className="notice">Choose two different bills to compare.</p>}
        <div className="comparison-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={sorted.map((bill) => ({ month: monthLabel(bill.billingMonth), amount: bill.totalPayable }))} margin={{ left: 5, right: 5 }}><CartesianGrid stroke="#e8edf7" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => [currency(Number(value)), 'Uploaded bill amount']} /><Bar dataKey="amount" fill="#3c6df0" radius={[6, 6, 0, 0]} maxBarSize={64} /></BarChart></ResponsiveContainer></div>
      </section>}
      {!!sorted.length && <section className="saved-bills"><div className="section-heading"><h3>Saved bills for {home.name}</h3><span>Newest first</span></div>{[...sorted].reverse().map((bill) => <div className="saved-bill-row" key={bill.id}><span className="file-icon"><FileText size={20} /></span><div><strong>{monthLabel(bill.billingMonth)}</strong><small>{bill.source} · {bill.billingDays} days · {bill.phase}</small></div><span>{bill.units.toLocaleString('en-IN')} units</span><strong>{currency(bill.totalPayable)}</strong><button className="icon-button" aria-label={`Delete ${monthLabel(bill.billingMonth)} bill`} onClick={() => {
        if (!window.confirm(`Remove the saved ${monthLabel(bill.billingMonth)} bill from ${home.name}? The original file is not affected.`)) return
        onChange((current) => ({ ...current, bills: current.bills.filter((item) => item.id !== bill.id), profileComplete: current.bills.length === 1 ? false : current.profileComplete }))
      }}><Trash2 size={16} /></button></div>)}</section>}
    </section>
  )
}
