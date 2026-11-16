import { useEffect, useState } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Bot, Check, ChevronRight, Droplets, FileText, Home as HomeIcon, Lightbulb, LogOut, Plus, ShieldCheck, SlidersHorizontal, Sparkles, Upload, UserRound, X, Zap } from 'lucide-react'
import { createHome, type Home, type Workspace } from './data'
import { applianceKwh, generationWaterBenchmark, generationWaterLitres, getBreakdown, getRecommendations, getRuntimeSuggestions, simulateBill, type Recommendation, type SimulationSettings } from './engine'
import { compareBills } from './bills'
import { currency, monthLabel } from './format'
import { emptyProfileStore, loadProfileStore, saveProfileStore, type LocalProfile } from './storage'
import BillsPanel from './BillsPanel'
import Chat from './Chat'
import './App.css'

type View = 'summary' | 'bills' | 'chat'

function App() {
  const [initial] = useState(() => {
    try { return { profiles: loadProfileStore(localStorage), error: '' } }
    catch { return { profiles: emptyProfileStore(), error: 'Your saved profiles could not be read. They have not been replaced. Browser storage may be blocked or the saved data may be damaged.' } }
  })
  const [profiles, setProfiles] = useState(initial.profiles)
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [loadError, setLoadError] = useState(initial.error)
  const [saveError, setSaveError] = useState('')
  const [view, setView] = useState<View>('summary')
  const [blocking, setBlocking] = useState(false)
  const [dialog, setDialog] = useState<'home' | 'profile' | null>(null)
  const [dialogName, setDialogName] = useState('')
  const [dialogHomeName, setDialogHomeName] = useState('')

  useEffect(() => {
    if (loadError) return
    // A failed external storage write must be visible rather than looking saved.
    // eslint-disable-next-line react/set-state-in-effect
    try { saveProfileStore(localStorage, profiles); setSaveError('') }
    catch { setSaveError('Your changes could not be saved on this browser. Keep this tab open; enable browser storage before continuing.'); }
  }, [profiles, loadError])

  const activeProfile = profiles.profiles.find((profile) => profile.id === profiles.activeProfileId)
  const workspace = activeProfile?.workspace
  const home = workspace?.homes.find((item) => item.id === workspace.activeHomeId)
  const setWorkspace = (update: (current: Workspace) => Workspace) => {
    setProfiles((current) => ({ ...current, profiles: current.profiles.map((profile) => profile.id === activeProfile?.id ? { ...profile, workspace: update(profile.workspace) } : profile) }))
  }
  const selectProfile = (id: string | null) => {
    if (blocking) return
    if (id !== null && !profiles.profiles.some((profile) => profile.id === id)) {
      setSaveError('That profile could not be found. Please reload the profile list.'); return
    }
    const next = { ...profiles, activeProfileId: id }
    try {
      saveProfileStore(localStorage, next)
      setProfiles(next)
      setCreatingProfile(false)
      setView('summary')
      setDialog(null)
      setSaveError('')
    } catch {
      setDialog(null)
      setSaveError('Your profile could not be switched safely because browser storage is unavailable. Your current profile and changes have been kept. Please enable storage and retry.')
    }
  }
  const updateHome = (id: string, update: (home: Home) => Home) => {
    setWorkspace((current) => current ? { ...current, homes: current.homes.map((item) => item.id === id ? update(item) : item) } : current)
  }
  const selectHome = (id: string) => {
    if (blocking) return
    setWorkspace((current) => current ? { ...current, activeHomeId: id } : current)
    setView('summary')
  }

  if (loadError) return <main className="welcome-page"><div className="welcome-card"><Brand /><h1>Let’s recover your workspace</h1><p role="alert">{loadError}</p><button className="button secondary" onClick={() => window.location.reload()}>Try reading it again</button><button className="button primary" onClick={() => {
    if (window.confirm('Start a new workspace and replace the unreadable saved data when you create your profile?')) setLoadError('')
  }}>Start a new local workspace</button></div></main>

  if (!workspace || !home) {
    if (profiles.profiles.length && !creatingProfile) return <ProfileChooser profiles={profiles.profiles} error={saveError} onOpen={selectProfile} onCreate={() => setCreatingProfile(true)} />
    return <Welcome error={saveError} onBack={profiles.profiles.length ? () => setCreatingProfile(false) : undefined} onCreate={(name, homeName) => {
      const first = createHome(homeName)
      const id = crypto.randomUUID()
      const nextWorkspace: Workspace = { version: 2, name, homes: [first], activeHomeId: first.id }
      setProfiles((current) => ({ ...current, activeProfileId: id, profiles: [...current.profiles, { id, workspace: nextWorkspace }] }))
      setCreatingProfile(false)
    }} />
  }

  const stage = !home.bills.length ? 'bills' : !home.profileComplete ? 'chat' : view
  const step = !home.bills.length ? 1 : !home.profileComplete ? 2 : 3
  const changeHome = (update: (home: Home) => Home) => updateHome(home.id, update)
  const openProfile = () => { setDialogName(workspace.name); setDialogHomeName(home.name); setDialog('profile') }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <span className="sidebar-caption">YOUR ENERGY WORKSPACE</span>
        <nav aria-label="Main navigation">
          <button className={stage === 'summary' ? 'selected' : ''} disabled={blocking || !home.profileComplete} onClick={() => setView('summary')}><Sparkles size={18} /> My insights</button>
          <button className={stage === 'bills' ? 'selected' : ''} disabled={blocking || !home.profileComplete} onClick={() => setView('bills')}><FileText size={18} /> My bills <span>{home.bills.length}</span></button>
          <button className={stage === 'chat' ? 'selected' : ''} disabled={blocking || !home.bills.length} onClick={() => setView('chat')}><Bot size={18} /> Energy assistant</button>
        </nav>
        <div className="sidebar-homes"><div className="section-heading"><span className="sidebar-caption">MY HOMES</span><button className="icon-button" aria-label="Add another home" disabled={blocking} onClick={() => { setDialogName(''); setDialog('home') }}><Plus size={17} /></button></div>
          {workspace.homes.map((item) => <button className={`home-switch ${item.id === home.id ? 'active' : ''}`} disabled={blocking} key={item.id} onClick={() => selectHome(item.id)}><HomeIcon size={18} /><span><strong>{item.name}</strong><small>{item.bills.length ? `${item.bills.length} ${item.bills.length === 1 ? 'bill' : 'bills'} saved` : 'Ready to set up'}</small></span>{item.id === home.id && <Check size={15} />}</button>)}
          <button className="text-button" disabled={blocking} onClick={() => { setDialogName(''); setDialog('home') }}><Plus size={15} /> Add a home</button>
        </div>
        <div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={18} /><div><strong>Yours, on this device</strong><p>Profiles and homes are saved in this browser. They are not password-protected.</p></div></div><button className="user-button" disabled={blocking} onClick={openProfile}><span className="avatar">{workspace.name[0].toUpperCase()}</span><span><strong>{workspace.name}</strong><small>Personal workspace</small></span><UserRound size={16} /></button><button className="text-button sign-out" aria-label={`Sign out of ${workspace.name}`} disabled={blocking} onClick={() => selectProfile(null)}><LogOut size={15} /> Sign out</button></div>
      </aside>
      <main className="workspace">
        <header className="topbar"><div className="breadcrumbs"><HomeIcon size={15} /><button className="breadcrumb-home" type="button" aria-label={`Open insights for ${home.name}`} title={home.name} disabled={blocking || !home.profileComplete} onClick={() => setView('summary')}>{home.name}</button><ChevronRight size={14} /><strong>{stage === 'summary' ? 'Your insights' : stage === 'bills' ? 'Electricity bills' : 'Your devices'}</strong></div><div className="mobile-home-select"><select aria-label="Select your home" disabled={blocking} value={home.id} onChange={(event) => selectHome(event.target.value)}>{workspace.homes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="icon-button" disabled={blocking} aria-label="Add a home on mobile" onClick={() => { setDialogName(''); setDialog('home') }}><Plus size={18} /></button></div><span className="desktop-status"><ShieldCheck size={15} /> {saveError ? 'Changes not saved' : 'Saved on this device'}</span></header>
        <div className="page-content">
          {saveError && <div className="alert" role="alert">{saveError}</div>}
          <section className="welcome-row"><div><span className="eyebrow">LESS GUESSWORK. MORE CLARITY.</span><h1>{stage === 'summary' ? `${workspace.name}, here’s your home in a nutshell.` : `Hi ${workspace.name}, let’s make this simple.`}</h1><p>{stage === 'summary' ? 'What you spent, what changed, and one thing to try next.' : 'Your bills and a few device details are all we need.'}</p></div>{home.profileComplete && stage === 'summary' && <button className="button secondary" onClick={() => setView('bills')}><Upload size={17} /> Add more bills</button>}</section>
          {!home.profileComplete && <div className="setup-steps"><span className="done"><Check size={15} /> Your name & home</span><ChevronRight size={14} /><span className={step > 1 ? 'done' : 'current'}>{step > 1 ? <Check size={15} /> : '2'} Upload bills</span><ChevronRight size={14} /><span className={step === 2 ? 'current' : ''}>3 Tell us about devices</span><ChevronRight size={14} /><span>4 Your insights</span></div>}
          {stage === 'bills' && <BillsPanel key={home.id} home={home} onChange={changeHome} onBlocking={setBlocking} />}
          {stage === 'chat' && <Chat key={home.id} home={home} onChange={changeHome} onFinish={() => { changeHome((current) => ({ ...current, profileComplete: true })); setView('summary') }} />}
          {stage === 'summary' && <Dashboard key={home.id} home={home} onChat={() => setView('chat')} onBills={() => setView('bills')} />}
          <footer className="page-footer"><Zap size={13} /><span>Bill figures are yours. Savings are estimates, not guarantees.</span></footer>
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation"><button disabled={blocking || !home.profileComplete} onClick={() => setView('summary')}><Sparkles size={18} />Insights</button><button disabled={blocking || !home.profileComplete} onClick={() => setView('bills')}><FileText size={18} />Bills</button><button disabled={blocking || !home.bills.length} onClick={() => setView('chat')}><Bot size={18} />Assistant</button><button disabled={blocking} onClick={openProfile}><UserRound size={18} />Profile</button></nav>
      {dialog && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="section-heading"><h2 id="dialog-title">{dialog === 'home' ? 'Add another home' : 'Your profile'}</h2><button className="icon-button" aria-label="Close dialog" onClick={() => setDialog(null)}><X size={20} /></button></div><p>Each home has its own bills, devices, and conversation.</p><form onSubmit={(event) => {
        event.preventDefault()
        if (!dialogName.trim() || (dialog === 'profile' && !dialogHomeName.trim())) return
        if (dialog === 'home') {
          const next = createHome(dialogName.trim())
          setWorkspace((current) => current ? { ...current, homes: [...current.homes, next], activeHomeId: next.id } : current)
          setView('summary')
        } else {
          setWorkspace((current) => current ? { ...current, name: dialogName.trim(), homes: current.homes.map((item) => item.id === home.id ? { ...item, name: dialogHomeName.trim() } : item) } : current)
        }
        setDialog(null)
      }}><label>{dialog === 'home' ? 'Home name' : 'Your name'}<input autoFocus required pattern=".*\S.*" title="Please enter a name, not just spaces." maxLength={60} value={dialogName} onChange={(event) => setDialogName(event.target.value)} placeholder="e.g. Our apartment" /></label>{dialog === 'profile' && <label>Current home name<input required pattern=".*\S.*" title="Please enter a home name, not just spaces." maxLength={60} value={dialogHomeName} onChange={(event) => setDialogHomeName(event.target.value)} /></label>}<button className="button primary" type="submit">Save {dialog === 'home' ? 'home' : 'profile'} <ArrowRight size={16} /></button></form>{dialog === 'profile' && <div className="profile-sign-out"><p>Signing out keeps your bills here. Other people using this browser can still open your profile.</p><button className="button secondary" disabled={blocking} onClick={() => selectProfile(null)}><LogOut size={16} /> Sign out</button></div>}</section></div>}
    </div>
  )
}

function Brand() { return <div className="brand"><span><Zap size={23} fill="currentColor" /></span><strong>WattWise<small>PUNE</small></strong></div> }

function ProfileChooser({ profiles, error, onOpen, onCreate }: { profiles: LocalProfile[]; error: string; onOpen: (id: string) => void; onCreate: () => void }) {
  return <main className="profile-page"><section className="profile-card"><Brand /><h1>Choose your profile</h1><p>Open your saved workspace, or start a separate one for someone else.</p>{error && <div className="alert" role="alert">{error}</div>}<div className="profile-list">{profiles.map(({ id, workspace }) => <button key={id} className="profile-option" onClick={() => onOpen(id)}><span className="avatar">{workspace.name[0].toUpperCase()}</span><span><strong>{workspace.name}</strong><small>{workspace.homes.length} {workspace.homes.length === 1 ? 'home' : 'homes'} · {workspace.homes[0].name}</small></span><ArrowRight size={18} /></button>)}</div><button className="button primary" onClick={onCreate}><Plus size={17} /> Create another profile</button><p className="notice">Local profiles are not secure accounts. No password is required; anyone using this browser can open them. Clearing site data removes all profiles.</p></section></main>
}

function Welcome({ onCreate, onBack, error }: { onCreate: (name: string, homeName: string) => void; onBack?: () => void; error: string }) {
  const [name, setName] = useState('')
  const [homeName, setHomeName] = useState('')
  return <main className="welcome-page"><div className="welcome-card"><Brand /><span className="welcome-tag"><Zap size={14} /> ELECTRICITY INSIGHTS, WITHOUT THE JARGON</span><h1>A clearer bill.<br />A smarter home.</h1><p>You don’t need to understand tariffs or watts. Let’s start with you, then turn your bills into simple next steps.</p>{error && <div className="alert" role="alert">{error}</div>}<div className="welcome-journey"><span><FileText size={20} /> Upload your bill</span><ChevronRight size={15} /><span><Bot size={20} /> Tell us about devices</span><ChevronRight size={15} /><span><Lightbulb size={20} /> Find a small change</span></div><form onSubmit={(event) => { event.preventDefault(); if (name.trim() && homeName.trim()) onCreate(name.trim(), homeName.trim()) }}><label>What should we call you?<input autoComplete="given-name" required pattern=".*\S.*" title="Please enter a name, not just spaces." maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your first name" /></label><label>Give your home a name<input required pattern=".*\S.*" title="Please enter a home name, not just spaces." maxLength={60} value={homeName} onChange={(event) => setHomeName(event.target.value)} placeholder="e.g. Our Pune apartment" /><small>You can add another home later.</small></label><button className="button primary" type="submit">Let’s get started <ArrowRight size={18} /></button></form><p className="welcome-privacy"><ShieldCheck size={16} /> No sign-up. Details stay in this browser. Please use your own device.</p>{onBack && <button className="text-button" onClick={onBack}>Back to profiles</button>}</div><aside className="welcome-art" aria-hidden="true"><span className="electric-orbit orbit-one" /><span className="electric-orbit orbit-two" /><div className="electric-disc"><Zap size={104} fill="currentColor" /></div><div className="art-caption"><span>YOUR ENERGY, EXPLAINED.</span><h2>Small changes.<br />Real-world impact.</h2><p>Start with your own home.<br />No sample profiles. No guesswork about your bill.</p></div><span className="art-bill"><FileText size={22} /> Your bill → your insights</span></aside></main>
}

function Dashboard({ home, onChat, onBills }: { home: Home; onChat: () => void; onBills: () => void }) {
  const bills = [...home.bills].sort((a, b) => a.billingMonth.localeCompare(b.billingMonth))
  const [selectedId, setSelectedId] = useState(bills.at(-1)?.id ?? '')
  const [settings, setSettings] = useState<SimulationSettings>({})
  const [showAllActions, setShowAllActions] = useState(false)
  const selected = bills.find((bill) => bill.id === selectedId) ?? bills.at(-1)
  if (!selected) return null
  const previous = bills[bills.findIndex((bill) => bill.id === selected.id) - 1]
  const comparison = previous ? compareBills(previous, selected) : null
  const recommendations = getRecommendations(selected, home.appliances)
  const best = recommendations.find((item) => item.action && item.kwhSaved > 0)
  const profileCheck = recommendations.find((item) => item.id === 'profile')
  const simulation = simulateBill(selected, home.appliances, settings)
  const runtimeSuggestions = getRuntimeSuggestions(home.appliances)
  const applianceUses = home.appliances.map((appliance) => ({ ...appliance, units: applianceKwh(appliance, {}, selected.billingDays) })).sort((a, b) => b.units - a.units)
  const maxUnits = Math.max(1, ...applianceUses.map((item) => item.units))
  const baselineUnits = applianceUses.reduce((sum, item) => sum + item.units, 0)
  const tryAction = (action: Recommendation['action']) => {
    if (action === 'ac') setSettings((current) => ({ ...current, acTemperature: 24 }))
    if (action === 'geyser') setSettings((current) => ({ ...current, geyserStandby: false }))
    if (action === 'fans') setSettings((current) => ({ ...current, bldcFans: true }))
    if (typeof action === 'object') setSettings((current) => ({ ...current, applianceHours: { ...current.applianceHours, [action.applianceId]: action.hoursPerDay } }))
    document.getElementById('simulator')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  return <>
    <div className="month-picker"><label>Looking at<select aria-label="Dashboard bill month" value={selected.id} onChange={(event) => { setSelectedId(event.target.value); setSettings({}) }}>{[...bills].reverse().map((bill) => <option key={bill.id} value={bill.id}>{monthLabel(bill.billingMonth)}</option>)}</select></label><span>{selected.billingDays} billing days · {selected.phase}</span></div>
    <section className="summary-grid">
      <article className="summary-card"><span><FileText size={18} /> Your bill amount</span><strong>{currency(selected.totalPayable)}</strong><p>From your uploaded {monthLabel(selected.billingMonth)} bill</p></article>
      <article className="summary-card"><span><Zap size={18} /> Electricity you used</span><strong>{selected.units.toLocaleString('en-IN')}<small> units</small></strong><p>{(selected.units / selected.billingDays).toFixed(1)} units a day on average</p></article>
      <article className="summary-card"><span>{comparison && comparison.amountDifference > 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />} Compared with your previous bill</span><strong>{comparison ? `${currency(Math.abs(comparison.amountDifference))}` : 'One bill so far'}</strong><p>{comparison ? comparison.amountDifference === 0 ? 'The total amount stayed the same' : `${comparison.amountDifference > 0 ? 'Higher' : 'Lower'} than ${monthLabel(previous.billingMonth)}${selected.billingDays !== previous.billingDays ? ' · different billing days' : ''}` : 'Add another month to see what changed'}</p></article>
    </section>
    <section className="next-step-hero"><div><span className="eyebrow"><Lightbulb size={16} /> ONE THING TO TRY NEXT</span><h2>{best ? best.title : profileCheck ? profileCheck.title : home.appliances.length ? 'Keep your device details up to date' : 'Tell us what runs in your home'}</h2><p>{best ? best.description : profileCheck ? profileCheck.description : home.appliances.length ? 'Try a device tip below, or compare your next bill.' : 'Add your devices to find a practical saving.'}</p><button className="button primary" onClick={() => best ? tryAction(best.action) : onChat()}>{best ? 'Try this change' : 'Open energy assistant'}<ArrowRight size={17} /></button></div>{best ? <div className="hero-saving"><span>Possible saving</span><strong>{best.monthlySavings === null ? `${best.kwhSaved.toFixed(1)} units` : currency(best.monthlySavings)}</strong><small>per {selected.billingDays}-day bill · estimate only</small></div> : <div className="hero-symbol"><Zap size={65} fill="currentColor" /></div>}</section>
    <div className="dashboard-grid">
      <section className="panel"><div className="section-heading"><div><h2>What’s using the most power?</h2><p>Estimates from the devices and hours you told us.</p></div><button className="text-button" onClick={onChat}>Edit devices <ArrowRight size={15} /></button></div>{applianceUses.length ? <div className="usage-bars">{applianceUses.slice(0, 5).map((item, index) => <div className="usage-row" key={item.id}><span className="usage-rank">{index + 1}</span><div><div><strong>{item.name}</strong><small>{item.units.toFixed(0)} units</small></div><span className="usage-track"><i style={{ width: `${item.units / maxUnits * 100}%`, background: ['#3c6df0', '#f0b14b', '#809bf2', '#ba91e5', '#6d8aaa'][index] }} /></span></div></div>)}</div> : <p className="empty-state">No device estimates yet. The assistant can help you build your list.</p>}<p className="notice">{applianceUses.length ? `Listed devices estimate ${Math.round(baselineUnits)} of your ${selected.units} billed units. This is not a meter reading${Math.abs(baselineUnits - selected.units) > selected.units * 0.2 ? '; check missing devices or daily hours before assuming waste or a fault' : ''}.` : 'Your bill amounts above are real uploaded values. Device estimates appear only after you add devices.'}</p></section>
      <section className="panel"><div className="section-heading"><div><h2>Your next small steps</h2><p>Based on your devices. Try one at a time.</p></div></div>{recommendations.length ? recommendations.slice(0, showAllActions ? recommendations.length : 3).map((item) => <ActionCard key={item.id} item={item} onTry={() => item.action ? tryAction(item.action) : onChat()} />) : <div className="empty-state"><Lightbulb size={26} /><p>No device-specific actions yet.</p><button className="text-button" onClick={onChat}>Add your devices <ArrowRight size={15} /></button></div>}{recommendations.length > 3 && <button className="text-button" onClick={() => setShowAllActions((current) => !current)}>{showAllActions ? 'Show fewer steps' : `Show all ${recommendations.length} ways to save`} <ArrowRight size={15} /></button>}</section>
    </div>
    {home.appliances.length > 0 && <section className="panel simulator" id="simulator"><div className="section-heading"><div className="heading-icon"><SlidersHorizontal size={23} /></div><div><h2>What if I made a change?</h2><p>Try changes together. Your saved devices stay unchanged.</p></div><button className="text-button" onClick={() => setSettings({})}>Reset changes</button></div><div className="simulator-layout"><div className="simulator-controls">
      {home.appliances.some((item) => item.category === 'AC') && <label className="slider-label"><span>Try an AC temperature<strong>{settings.acTemperature !== undefined ? `${settings.acTemperature}°C` : 'Your current settings'}</strong></span><input aria-label="Try AC temperature" type="range" min="18" max="28" value={settings.acTemperature ?? home.appliances.find((item) => item.category === 'AC')?.setpoint ?? 24} onChange={(event) => setSettings((current) => ({ ...current, acTemperature: Number(event.target.value) }))} /><small>24°C or warmer avoids extra cooling demand in this model.</small></label>}
      {home.appliances.some((item) => item.category === 'Geyser' && item.standby) && <label className="simulation-check"><input type="checkbox" checked={settings.geyserStandby === false} onChange={(event) => setSettings((current) => ({ ...current, geyserStandby: event.target.checked ? false : undefined }))} /><span><strong>Switch off geyser standby</strong><small>Only affects geysers you said were left on.</small></span></label>}
      {home.appliances.some((item) => item.category === 'Fan' && item.watts >= 60) && <label className="simulation-check"><input type="checkbox" checked={settings.bldcFans ?? false} onChange={(event) => setSettings((current) => ({ ...current, bldcFans: event.target.checked }))} /><span><strong>Replace standard fans with 28W BLDC fans</strong><small>Purchase cost is not included in savings.</small></span></label>}
      {runtimeSuggestions.map((suggestion) => <label className="simulation-check" key={suggestion.applianceId}><input type="checkbox" checked={settings.applianceHours?.[suggestion.applianceId] === suggestion.hoursPerDay} onChange={(event) => {
        const checked = event.target.checked
        setSettings((current) => {
          const applianceHours = { ...current.applianceHours }
          if (checked) applianceHours[suggestion.applianceId] = suggestion.hoursPerDay
          else delete applianceHours[suggestion.applianceId]
          return { ...current, applianceHours }
        })
      }} /><span><strong>{suggestion.title}</strong><small>{suggestion.description}</small></span></label>)}
      {!runtimeSuggestions.length && !home.appliances.some((item) => item.category === 'AC' || item.category === 'Geyser' && item.standby || item.category === 'Fan' && item.watts >= 60) && <p className="muted">No quantified changes for these device details yet. We do not suggest switching off refrigerators, routers, or essential charging to create a saving.</p>}
    </div><div className="projection">{baselineUnits > selected.units * 1.2 ? <><span>Check your device details first</span><p>Device estimates exceed billed use. Check quantities and hours before estimating savings.</p><button className="text-button" onClick={onChat}>Check my devices <ArrowRight size={15} /></button></> : <><span>Possible bill after changes</span><strong>{simulation.projectedAmount === null ? 'Rate not verified' : currency(simulation.projectedAmount)}</strong>{simulation.savings !== null && <p>{simulation.savings >= 0 ? `${currency(simulation.savings)} less` : `${currency(-simulation.savings)} more`} than your uploaded bill</p>}<small>{selected.units} → {simulation.projectedUnits.toFixed(1)} units · {selected.billingDays} days</small></>}</div></div><p className="estimate-disclaimer">Estimate only. Individual savings can overlap; use the combined result.</p></section>}
    <section className="compare-prompt"><span className="file-icon"><FileText size={23} /></span><div><h3>{home.bills.length > 1 ? 'Want to see how your bills compare?' : 'Your next bill will tell a bigger story'}</h3><p>{home.bills.length > 1 ? 'Compare any two uploaded months, including daily usage when billing periods differ.' : 'Upload more months to compare spending and electricity use. We won’t make up a history.'}</p></div><button className="button secondary" onClick={onBills}>{home.bills.length > 1 ? 'Compare my bills' : 'Add another bill'}<ArrowRight size={16} /></button></section>
    <details className="technical-details"><summary>How fewer units reduce your cost</summary><p>Device units = watts ÷ 1,000 × hours × days × quantity, with the device-model adjustments. Saved units are removed from the highest occupied slab first, not multiplied by your average bill price.</p>{simulation.tariff ? <><p><a href={simulation.tariff.source} target="_blank" rel="noreferrer">{simulation.tariff.label}</a> · LT I(B) residential, published energy + wheeling charges.</p>{getBreakdown(selected.units, simulation.tariff).map((slab, index) => <div key={index}><span>{slab.label}: {slab.units.toFixed(1)} units</span><strong>{currency(slab.cost)}</strong></div>)}</> : <p role="status">The tariff for {monthLabel(selected.billingMonth)} is not verified in this app. Unit changes are available, but no rupee saving is estimated.</p>}<p>Higher summer use can enter higher slabs; there is no assumed seasonal multiplier. Monthly FAC, duty/tax changes and time-of-use charges are not modeled. Fixed charges, arrears and other uploaded bill adjustments stay unchanged. Monthly slab boundaries are an illustration, not a reconstruction of a prorated bill. Weather and actual device use can change the result.</p></details>
    <section className="panel water-insight" aria-labelledby="water-insight-title"><div className="water-heading"><Droplets size={24} /><div><h2 id="water-insight-title">Water behind your electricity</h2><p>Historical power-generation equivalent, not your home’s water use.</p></div></div><strong className="water-value">≈ {Math.round(generationWaterLitres(selected.units)).toLocaleString('en-IN')} litres</strong><details className="tip-details"><summary>Benchmark and source</summary><p>{selected.units} units × {generationWaterBenchmark.litresPerKwh} litres/unit: India’s {generationWaterBenchmark.year} thermal-power average. Not a measurement of today’s Pune grid; fuel mix, cooling and delivery losses vary. <a href={generationWaterBenchmark.source} target="_blank" rel="noreferrer">WRI, Parched Power (2018), p. 16</a>.</p></details></section>
  </>
}

function ActionCard({ item, onTry }: { item: Recommendation; onTry: () => void }) {
  return <article className="action-card"><div><span className={`action-tag ${item.effort === 'Upgrade' ? 'amber' : ''}`}>{item.effort}</span><h3>{item.title}</h3>{item.id === 'profile' ? <p>{item.description}</p> : <details className="tip-details"><summary>{item.action ? 'Assumptions' : 'How to do it'}</summary><p>{item.description}</p>{item.source && <a href={item.source} target="_blank" rel="noreferrer">Energy-saving guidance</a>}</details>}{(item.action || item.id === 'profile') && <button className="text-button" onClick={onTry}>{item.action ? 'See the impact' : 'Check my devices'}<ArrowRight size={14} /></button>}</div>{item.kwhSaved > 0 && <aside>{item.monthlySavings !== null && item.monthlySavings > 0 && <strong>{currency(item.monthlySavings)}</strong>}<small>{item.kwhSaved.toFixed(1)} fewer units</small><small>possible / bill</small></aside>}</article>
}

export default App
