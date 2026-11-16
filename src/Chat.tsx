import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm'
import { ArrowRight, Bot, Check, Download, LoaderCircle, Plus, Send, ShieldCheck, X } from 'lucide-react'
import { applianceCatalog, appliancePowerPresets, appliancePowerReferences, applianceSchema, approximateWatts, type Appliance, type Home } from './data'
import { aiReplySchema, aiSystemPrompt, conversationContext, guidedReply, replyJsonSchema, topics, type AiReply, type DeviceProposal } from './conversation'
import { readBillFile } from './bills'
import { applianceKwh } from './engine'

type Props = { home: Home; onChange: (update: (home: Home) => Home) => void; onFinish: () => void }

export default function Chat({ home, onChange, onFinish }: Props) {
  const [input, setInput] = useState('')
  const [proposals, setProposals] = useState<(DeviceProposal & { id: string })[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')
  const [mode, setMode] = useState<'guided' | 'ai'>('guided')
  const [aiReady, setAiReady] = useState(false)
  const [error, setError] = useState('')
  const engine = useRef<WebWorkerMLCEngine | null>(null)
  const worker = useRef<Worker | null>(null)
  const mounted = useRef(true)
  const bottom = useRef<HTMLDivElement>(null)
  const topic = topics[Math.min(home.chatTopic, 3)]

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; worker.current?.terminate(); engine.current = null }
  }, [])

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [home.messages.length, busy])

  const enableAi = async () => {
    if (engine.current) { setMode('ai'); setError(''); return }
    if (!('gpu' in navigator)) { setError('This browser does not support WebGPU. Try a compatible Chrome or Edge browser, or continue with guided chat.'); return }
    setError('')
    setLoading(true)
    setProgress('Checking your device and downloading the private AI model…')
    try {
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm')
      if (!mounted.current) return
      worker.current = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
      const loaded = await CreateWebWorkerMLCEngine(worker.current, 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC', {
        initProgressCallback: (report) => { if (mounted.current) setProgress(report.text) },
      }, { context_window_size: 4096 })
      if (!mounted.current) { await loaded.unload(); return }
      engine.current = loaded
      setAiReady(true)
      setMode('ai')
      setProgress('')
    } catch (failure) {
      worker.current?.terminate()
      worker.current = null
      if (mounted.current) setError(`Private AI could not start: ${failure instanceof Error ? failure.message : 'unknown loading error'}. You can retry or choose guided chat.`)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }

  const send = async (text: string) => {
    if (!text.trim() || busy || loading) return
    if (proposals.length) { setError('Please add or dismiss the device cards below before sending another message.'); return }
    setError('')
    setBusy(true)
    const userMessage = { id: crypto.randomUUID(), from: 'user' as const, text: text.trim() }
    const conversation = [...home.messages, userMessage]
    try {
      let response: AiReply
      if (mode === 'ai') {
        if (!engine.current) throw new Error('Private AI is not ready. Please enable it again.')
        const output = await engine.current.chat.completions.create({
          messages: [{ role: 'system', content: aiSystemPrompt(home.appliances, home.chatTopic) }, ...conversationContext(conversation)],
          temperature: 0.2, max_tokens: 650,
          response_format: { type: 'json_object', schema: JSON.stringify(replyJsonSchema) },
        })
        const content = output.choices[0]?.message.content
        if (!content) throw new Error('The AI returned no answer. Please try again.')
        response = aiReplySchema.parse(JSON.parse(content))
      } else {
        response = guidedReply(text, home.chatTopic)
      }
      if (!mounted.current) return
      onChange((current) => ({
        ...current, messages: [...current.messages, userMessage, { id: crypto.randomUUID(), from: 'assistant', text: response.reply }],
      }))
      setProposals(response.devices.map((device) => ({ ...device, id: crypto.randomUUID() })))
      setInput('')
    } catch (failure) {
      if (mounted.current) setError(`Your message was not saved: ${failure instanceof Error ? failure.message : 'the conversation failed'}. Please retry. No appliances were added.`)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const nextTopic = () => {
    if (proposals.length) { setError('Please add or dismiss the suggested devices first.'); return }
    const next = Math.min(4, home.chatTopic + 1)
    onChange((current) => ({
      ...current, chatTopic: next,
      messages: [...current.messages, {
        id: crypto.randomUUID(), from: 'assistant',
        text: next < 4 ? topics[next].question : 'That covers the main parts of your home. Review your list, then select “Show my insights”. You can add more devices later.',
      }],
    }))
  }

  const addConfirmed = (id: string, appliance: Appliance) => {
    onChange((current) => ({
      ...current, appliances: [...current.appliances, appliance],
      messages: [...current.messages, { id: crypto.randomUUID(), from: 'assistant', text: `Added ${appliance.count} × ${appliance.name}, ${appliance.hoursPerDay} hours a day. You can edit this below. What else runs at home?` }],
    }))
    setProposals((current) => current.filter((proposal) => proposal.id !== id))
    setError('')
  }

  const finish = () => {
    if (proposals.length) { setError('Please review or dismiss all device suggestions before opening your insights.'); return }
    onFinish()
  }

  return (
    <section className="chat-panel">
      <div className="section-heading"><div className="heading-icon"><Bot size={24} /></div><div><h2>Let’s get to know your home</h2><p>A short conversation. No technical knowledge needed.</p></div><span className="mode-badge">{mode === 'ai' ? 'Private browser AI' : 'Guided chat · no AI model'}</span></div>
      <div className="ai-choice">
        <ShieldCheck size={20} />
        <div><strong>Want a natural AI conversation?</strong><p>Enable private AI: a one-time download of several hundred MB, about 1 GB of GPU memory, and a compatible browser are needed. The model runs here; chats are not sent to an AI provider.</p></div>
        <button className="button secondary" onClick={enableAi} disabled={loading || busy || mode === 'ai'}>{loading ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{mode === 'ai' ? 'AI enabled' : aiReady ? 'Use private AI' : 'Enable private AI'}</button>
      </div>
      {mode === 'ai' && <button className="text-button" disabled={busy} onClick={() => setMode('guided')}>Use lightweight guided chat instead</button>}
      {loading && <p className="notice" role="status">{progress} Please keep this tab open.</p>}
      <div className="topic-steps">{topics.map((item, index) => <span key={item.label} className={index === Math.min(home.chatTopic, 3) ? 'current' : index < home.chatTopic ? 'done' : ''}>{index < home.chatTopic ? <Check size={13} /> : index + 1} {item.label}</span>)}</div>
      <div className="conversation-log" aria-live="polite" aria-relevant="additions">
        {!home.messages.length && <div className="chat-bubble assistant"><span><Bot size={16} /></span><p>{topics[0].question}</p></div>}
        {home.messages.map((message) => <div className={`chat-bubble ${message.from}`} key={message.id}><span>{message.from === 'assistant' ? <Bot size={16} /> : 'You'}</span><p>{message.text}</p></div>)}
        {busy && <div className="chat-bubble assistant"><span><Bot size={16} /></span><p><LoaderCircle className="spin" size={14} /> Thinking on your device…</p></div>}
        <div ref={bottom} />
      </div>
      {error && <div className="alert" role="alert">{error}<button aria-label="Dismiss chat error" onClick={() => setError('')}><X size={15} /></button></div>}
      <div className="device-proposals">{proposals.map((proposal) => <DeviceEditor key={proposal.id} proposal={proposal} onAdd={(appliance) => addConfirmed(proposal.id, appliance)} onDismiss={() => setProposals((current) => current.filter((item) => item.id !== proposal.id))} />)}</div>
      <div className="quick-chips">{topic.chips.map((chip) => <button key={chip} disabled={busy || loading || proposals.length > 0} onClick={() => void send(chip)}>{chip}</button>)}</div>
      <form className="chat-composer" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void send(input) }}>
        <input aria-label="Message your energy assistant" maxLength={1500} value={input} onChange={(event) => setInput(event.target.value)} placeholder="e.g. 2 fans for 10 hours and 1 AC for 4 hours at 22°C" disabled={busy || loading} />
        <button className="button primary" type="submit" aria-label="Send message" disabled={!input.trim() || busy || loading}><Send size={18} /></button>
      </form>
      <div className="chat-footer"><button className="button secondary" disabled={busy || loading || proposals.length > 0} onClick={() => setProposals([{ id: crypto.randomUUID(), category: 'Other', count: 1, hoursPerDay: null, setpoint: null, standby: null }])}><Plus size={16} /> Add a device manually</button><div>{home.chatTopic < 4 && <button className="text-button" disabled={busy || loading} onClick={nextTopic}>Next topic <ArrowRight size={16} /></button>}<button className="button primary" disabled={busy || loading} onClick={finish}>Show my insights <ArrowRight size={16} /></button></div></div>
      <ApplianceList appliances={home.appliances} onChange={onChange} />
    </section>
  )
}

function DeviceEditor({ proposal, onAdd, onDismiss }: { proposal: DeviceProposal; onAdd: (appliance: Appliance) => void; onDismiss: () => void }) {
  const [category, setCategory] = useState(proposal.category)
  const [modelId, setModelId] = useState('')
  const [powerReferenceId, setPowerReferenceId] = useState('')
  const [powerPresetId, setPowerPresetId] = useState(appliancePowerPresets.find((item) => item.category === proposal.category)?.id ?? '')
  const [label, setLabel] = useState(proposal.category === 'Other' ? '' : proposal.category)
  const [count, setCount] = useState(String(proposal.count))
  const [hours, setHours] = useState(proposal.hoursPerDay === null ? '' : String(proposal.hoursPerDay))
  const [watts, setWatts] = useState(String(approximateWatts[proposal.category]))
  const [setpoint, setSetpoint] = useState(proposal.setpoint === null ? '' : String(proposal.setpoint))
  const [standby, setStandby] = useState(proposal.standby === null ? '' : String(proposal.standby))
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [labelStars, setLabelStars] = useState<number>()
  const [annualKwh, setAnnualKwh] = useState<number>()
  const selectedModel = applianceCatalog.find((item) => item.id === modelId)
  const selectedReference = appliancePowerReferences.find((item) => item.id === powerReferenceId)
  const selectedPreset = appliancePowerPresets.find((item) => item.id === powerPresetId)
  const presets = appliancePowerPresets.filter((item) => item.category === category)
  const missingDetails = !label.trim() || hours === '' || watts === '' || count === ''
    || (category === 'AC' && setpoint === '') || (category === 'Geyser' && standby === '')
  const values = {
    name: label.trim(), category, catalogId: selectedModel?.id,
    brand: selectedModel?.brand ?? '',
    model: selectedPreset ? `Approximate ${selectedPreset.label}` : selectedReference ? `Approximate reference: ${selectedReference.label}` : selectedModel?.model ?? (category === 'Inverter' ? 'Approximate extra-loss allowance' : 'Approximate power'),
    watts: Number(watts), hoursPerDay: Number(hours), count: Number(count),
    powerReferenceId: selectedReference?.id,
    setpoint: category === 'AC' ? Number(setpoint) : undefined,
    standby: category === 'Geyser' ? standby === 'true' : undefined,
    stars: labelStars ?? selectedModel?.stars, annualKwh: annualKwh ?? selectedModel?.annualKwh,
    beeYear: selectedModel?.beeYear, iseer: selectedModel?.iseer,
  }
  const preview = missingDetails ? null : applianceSchema.safeParse({ id: 'preview', ...values })
  const dailyKwh = preview?.success ? applianceKwh(preview.data, {}, 1) : null

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (missingDetails) {
      setError('Please complete the device details, including its heating hours or AC temperature.'); return
    }
    const result = applianceSchema.safeParse({ id: crypto.randomUUID(), ...values })
    if (!result.success) { setError('Please check the values: hours 0–24, quantity 1–100, power 1–30,000W, and AC temperature 18–28°C.'); return }
    onAdd(result.data)
  }

  return (
    <form className="device-editor" onSubmit={save}>
      <div className="section-heading"><div><h3>Check this device before adding</h3><p>We’ve filled approximate watts. Just check how many devices and their daily hours. Edit the power if you know it.</p></div><button type="button" className="icon-button" aria-label="Dismiss device suggestion" onClick={onDismiss}><X size={18} /></button></div>
      <div className="form-grid">
        <label>Device type<select value={category} onChange={(event) => {
          const found = applianceSchema.shape.category.parse(event.target.value)
          setCategory(found); setLabel(found === 'Other' ? '' : found); setModelId(''); setPowerReferenceId(''); setPowerPresetId(appliancePowerPresets.find((item) => item.category === found)?.id ?? ''); setWatts(String(approximateWatts[found])); setLabelStars(undefined); setAnnualKwh(undefined)
        }}>{applianceSchema.shape.category.options.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Name<input value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} required placeholder="e.g. Bedroom AC" /></label>
        {presets.length ? <label className="wide">Device / power estimate<select value={powerPresetId} onChange={(event) => {
          const preset = presets.find((item) => item.id === event.target.value)
          setPowerPresetId(preset?.id ?? ''); setModelId(''); setPowerReferenceId(''); setLabelStars(undefined); setAnnualKwh(undefined)
          if (preset) setWatts(String(preset.watts))
        }}><option value="">Custom power — edit watts below</option>{presets.map((item) => <option key={item.id} value={item.id}>{item.label} — approx. {item.watts} W</option>)}</select></label> : category === 'Water purifier' ? <label className="wide">Approximate power reference (optional)<select value={powerReferenceId} onChange={(event) => {
          const reference = appliancePowerReferences.find((item) => item.id === event.target.value)
          setPowerReferenceId(reference?.id ?? ''); setWatts(String(reference?.watts ?? approximateWatts[category]))
          setModelId(''); setLabelStars(undefined); setAnnualKwh(undefined)
        }}><option value="">No specific model — editable approximate power</option>{appliancePowerReferences.map((item) => <option key={item.id} value={item.id}>{item.label} — approx. {item.watts} W</option>)}</select></label> : category !== 'Inverter' && <label className="wide">Model (optional)<select value={modelId} onChange={(event) => {
          setModelId(event.target.value); setLabelStars(undefined); setAnnualKwh(undefined)
          const model = applianceCatalog.find((item) => item.id === event.target.value)
          setWatts(String(model?.watts ?? approximateWatts[category]))
        }}><option value="">I don’t know — use approximate power</option>{applianceCatalog.filter((item) => item.category === category).map((item) => <option key={item.id} value={item.id}>{item.brand} {item.model} — reference specs</option>)}</select></label>}
        <label>How many?<input type="number" min="1" max="100" required value={count} onChange={(event) => setCount(event.target.value)} /></label>
        <label>{category === 'Geyser' ? 'Heating hours per day (not standby)' : category === 'Water purifier' ? 'Active filtering hours per day' : category === 'Mobile charger' ? 'Active charging hours per day' : category === 'Inverter' ? 'Hours per day at this extra-loss power' : 'Hours per day'}<input type="number" min="0" max="24" step="any" required value={hours} onChange={(event) => setHours(event.target.value)} placeholder="e.g. 0.5 for 30 minutes" /></label>
        <label>{category === 'Inverter' ? 'Approximate extra loss / idle power (W)' : 'Approximate power in watts'}<input type="number" min="1" max="30000" required value={watts} onChange={(event) => { setWatts(event.target.value); setPowerReferenceId(''); setPowerPresetId('') }} /></label>
        {category === 'AC' && <label>AC temperature (°C)<input type="number" min="18" max="28" required value={setpoint} onChange={(event) => setSetpoint(event.target.value)} /></label>}
        {category === 'Geyser' && <label>Left on between uses?<select required value={standby} onChange={(event) => setStandby(event.target.value)}><option value="">Choose one</option><option value="true">Yes</option><option value="false">No — I switch it off</option></select></label>}
      </div>
      {selectedReference && <p className="notice">Approximate, not measured: {selectedReference.note} <a href={selectedReference.source} target="_blank" rel="noreferrer">Manufacturer source</a></p>}
      {category === 'Inverter' && <p className="notice">We start with an assumed 20 W extra-loss / idle allowance, not a verified manufacturer rating. Backup duration does not determine watts. This is not output VA or full charging power; connected devices are counted separately. Active conversion and charging losses may differ.</p>}
      {category === 'Water purifier' && <p className="notice">Aquaguard/RO/UV power varies by model. Confirm input watts and active filtering time; being plugged in all day does not mean the pump runs all day. Keep required hygiene cycles active.</p>}
      {category === 'Mobile charger' && <p className="notice">Count only time spent actively charging. Adapter ratings and fast-charging peaks are not constant power draw throughout a charge.</p>}
      {category !== 'Inverter' && <label className="label-scan"><Download size={15} />{scanning ? 'Reading your label…' : 'Read power from a device / BEE label photo'}<input type="file" disabled={scanning} accept=".jpg,.jpeg,.png" onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
        setError(''); setScanning(true)
        try {
          const text = await readBillFile(file)
          const power = text.match(/(?:rated\s*(?:input|power)|power\s*input)\D{0,10}(\d+(?:\.\d+)?)\s*w/i)?.[1] ?? text.match(/\b(\d{2,5})\s*watts?\b/i)?.[1]
          const annual = text.match(/(?:annual|yearly)\s*(?:energy\s*)?(?:consumption|units)\D{0,15}(\d+(?:\.\d+)?)/i)?.[1]
          const stars = text.match(/\b([1-5])\s*stars?\b/i)?.[1]
          if (!power && !annual && !stars) throw new Error('No readable power or BEE rating found. Please enter the power manually.')
          if (power) { setWatts(power); setPowerReferenceId(''); setPowerPresetId('') }
          if (annual) setAnnualKwh(Number(annual))
          if (stars) setLabelStars(Number(stars))
          setError('Label fields read. Please verify them against the photo; power stays approximate if no watts were found.')
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'The label could not be read.') }
        finally { setScanning(false) }
      }} /></label>}
      {error && <p className="notice" role="status">{error}</p>}
      {dailyKwh !== null && <p className="notice" role="status">Approximate electricity for all {count} device(s): <strong>{dailyKwh.toLocaleString('en-IN', { maximumFractionDigits: 3 })} kWh per day</strong>. Based on the watts and hours above, not a meter reading.</p>}
      <button className="button primary" type="submit" disabled={scanning}><Check size={16} /> Confirm and add device</button>
    </form>
  )
}

function ApplianceList({ appliances, onChange }: { appliances: Appliance[]; onChange: Props['onChange'] }) {
  const [error, setError] = useState('')
  const edit = (id: string, key: 'hoursPerDay' | 'count', value: string) => {
    const appliance = appliances.find((item) => item.id === id)
    if (!appliance) return
    const result = applianceSchema.safeParse({ ...appliance, [key]: Number(value) })
    if (value === '' || !result.success) { setError('Hours must be 0–24; quantity must be a whole number from 1–100. The previous value has been kept.'); return }
    setError('')
    onChange((home) => ({ ...home, appliances: home.appliances.map((item) => item.id === id ? result.data : item) }))
  }
  return <div className="device-list"><div className="section-heading"><h3>Your confirmed devices</h3><span>{appliances.length} entries</span></div>{error && <p className="alert" role="alert">{error}</p>}{!appliances.length && <p className="muted">Nothing added yet. Tell us about a device above, or continue with bill-only insights.</p>}{appliances.map((appliance) => {
    const reference = appliancePowerReferences.find((item) => item.id === appliance.powerReferenceId)
    return <div className="device-row" key={appliance.id}><div><strong>{appliance.name}</strong><small>{appliance.brand ? `${appliance.brand} ${appliance.model} · ` : `${appliance.model} · `}{appliance.watts}W{appliance.setpoint ? ` · ${appliance.setpoint}°C` : ''}</small><small>Approx. {applianceKwh(appliance, {}, 1).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kWh/day · all {appliance.count} device(s)</small>{reference && <small>Reference, not measured: {reference.label}. <a href={reference.source} target="_blank" rel="noreferrer">Source</a></small>}</div><label>Qty<input aria-label={`${appliance.name} quantity`} type="number" min="1" max="100" value={appliance.count} onChange={(event) => edit(appliance.id, 'count', event.target.value)} /></label><label>Hours/day<input aria-label={`${appliance.name} hours per day`} type="number" min="0" max="24" step="any" value={appliance.hoursPerDay} onChange={(event) => edit(appliance.id, 'hoursPerDay', event.target.value)} /></label><button className="icon-button" aria-label={`Remove ${appliance.name}`} onClick={() => onChange((home) => ({ ...home, appliances: home.appliances.filter((item) => item.id !== appliance.id) }))}><X size={16} /></button></div>
  })}</div>
}
