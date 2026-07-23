import { useEffect, useState } from 'react'

import { createCaptureDraft, toCapturePayload, type CaptureDraft, type PageCapture } from './capture-draft'

type ExtensionConfig = {
  apiBase: string
  token: string
}

const DEFAULT_API_BASE = 'http://localhost:3001'
const MAX_CAPTURE_CHARACTERS = 100_000

function normalizeApiBase(value: string) {
  return value.trim().replace(/\/$/, '')
}

async function loadConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get(['apiBase', 'token'])
  return {
    apiBase: typeof stored.apiBase === 'string' ? stored.apiBase : DEFAULT_API_BASE,
    token: typeof stored.token === 'string' ? stored.token : '',
  }
}

async function extractSelectedResearch(): Promise<PageCapture> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab.id) throw new Error('No active browser tab is available')
  if (!tab.url || !/^https?:/.test(tab.url)) throw new Error('Open a regular web page before capturing research')

  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const selection = window.getSelection()?.toString().trim() ?? ''
      const root = document.querySelector('main, article, [role="main"]') ?? document.body
      const sources = Array.from(root.querySelectorAll('a[href]'))
        .map((anchor) => ({ title: (anchor.textContent ?? '').trim(), url: (anchor as HTMLAnchorElement).href }))
        .filter((source) => source.title && /^https?:/.test(source.url))
        .filter((source, index, list) => list.findIndex((item) => item.url === source.url) === index)
        .slice(0, 25)
      return { selection, sources }
    },
  })

  const data = result?.result as { selection?: string; sources?: Array<{ title: string; url: string }> } | undefined
  if (!data?.selection) {
    throw new Error('Select the answer or passage you want to save, then capture it.')
  }

  return {
    sourceUrl: tab.url,
    sourceTitle: tab.title?.trim() || new URL(tab.url).hostname,
    content: data.selection.slice(0, MAX_CAPTURE_CHARACTERS),
    sources: data.sources ?? [],
  }
}

export function App() {
  const [config, setConfig] = useState<ExtensionConfig>({ apiBase: DEFAULT_API_BASE, token: '' })
  const [pairingCode, setPairingCode] = useState('')
  const [draft, setDraft] = useState<CaptureDraft | null>(null)
  const [deviceName, setDeviceName] = useState('Desktop browser')
  const [status, setStatus] = useState<{ tone: 'neutral' | 'success' | 'error'; message: string }>({ tone: 'neutral', message: 'Ready when you are.' })
  const [busy, setBusy] = useState(false)

  useEffect(() => { void loadConfig().then(setConfig) }, [])

  const paired = Boolean(config.token)

  const pair = async () => {
    setBusy(true)
    setStatus({ tone: 'neutral', message: 'Pairing with your local LLM Wiki…' })
    try {
      const apiBase = normalizeApiBase(config.apiBase)
      const response = await fetch(`${apiBase}/extension/pair`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode, name: deviceName }),
      })
      const body = await response.json() as { token?: string; error?: string }
      if (!response.ok || !body.token) throw new Error(body.error || 'Pairing was rejected')
      const next = { apiBase, token: body.token }
      await chrome.storage.local.set(next)
      setConfig(next)
      setPairingCode('')
      setStatus({ tone: 'success', message: 'Connected locally. Select a passage to capture.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Could not pair the extension' })
    } finally { setBusy(false) }
  }

  const beginCapture = async () => {
    setBusy(true)
    setStatus({ tone: 'neutral', message: 'Reading your explicit selection…' })
    try {
      const page = await extractSelectedResearch()
      setDraft(createCaptureDraft(page))
      setStatus({ tone: 'neutral', message: 'Review the selected research before saving it locally.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Could not prepare the capture' })
    } finally { setBusy(false) }
  }

  const saveCapture = async () => {
    if (!draft) return
    setBusy(true)
    setStatus({ tone: 'neutral', message: 'Saving your reviewed capture locally…' })
    try {
      const response = await fetch(`${normalizeApiBase(config.apiBase)}/extension/captures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
        body: JSON.stringify(toCapturePayload(draft, new Date().toISOString())),
      })
      const body = await response.json() as { id?: string; error?: string }
      if (!response.ok || !body.id) throw new Error(body.error || 'Capture was rejected')
      setDraft(null)
      setStatus({ tone: 'success', message: 'Saved to your local Research Inbox for review.' })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Could not capture research' })
    } finally { setBusy(false) }
  }

  const disconnect = async () => {
    await chrome.storage.local.remove('token')
    setConfig((current) => ({ ...current, token: '' }))
    setStatus({ tone: 'neutral', message: 'Disconnected. Pair again to capture.' })
  }

  return <main className="shell">
    <header className="hero"><span className="eyebrow">LLM WIKI · LOCAL RELAY</span><h1>Capture with intent.</h1><p>Nothing is read until you select it and press capture.</p></header>
    {!paired ? <section className="card stack">
      <div><h2>Pair this browser</h2><p>Generate a one-time code in LLM Wiki → Research Inbox.</p></div>
      <label>Local API address<input value={config.apiBase} onChange={(event) => setConfig((current) => ({ ...current, apiBase: event.target.value }))} placeholder={DEFAULT_API_BASE} /></label>
      <label>Pairing code<input value={pairingCode} onChange={(event) => setPairingCode(event.target.value.toUpperCase())} placeholder="ABCD-EF01-…" autoComplete="off" /></label>
      <label>Browser name<input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} /></label>
      <button type="button" onClick={pair} disabled={busy || !pairingCode.trim()}>{busy ? 'Pairing…' : 'Connect local extension'}</button>
    </section> : !draft ? <section className="card stack">
      <div className="connected"><span className="dot" />Connected to {normalizeApiBase(config.apiBase)}</div>
      <button type="button" onClick={beginCapture} disabled={busy}>{busy ? 'Preparing…' : 'Review selected research'}</button>
      <p className="hint">Highlight the answer or passage on the active page first. You can review the selected content before it is saved.</p>
      <button type="button" className="quiet" onClick={disconnect}>Disconnect this browser</button>
    </section> : <section className="card stack">
      <div className="connected"><span className="dot" />Review before saving</div>
      <div><h2>{draft.sourceTitle}</h2><p className="hint">The source page and URL remain attached as provenance.</p></div>
      <label>What question does this answer? <span>(optional)</span><textarea value={draft.query} onChange={(event) => setDraft((current) => current ? { ...current, query: event.target.value } : current)} placeholder="e.g. How does local-first sync work?" rows={3} /></label>
      <label>Selected research<textarea value={draft.content} onChange={(event) => setDraft((current) => current ? { ...current, content: event.target.value } : current)} rows={8} /></label>
      <p className="hint">{draft.sources.length} visible citations will be attached. You can curate them in the next review step.</p>
      <div className="actions"><button type="button" className="quiet" onClick={() => setDraft(null)} disabled={busy}>Back</button><button type="button" onClick={saveCapture} disabled={busy || !draft.content.trim()}>{busy ? 'Saving…' : 'Save reviewed research'}</button></div>
    </section>}
    <p className={`status ${status.tone}`} role="status">{status.message}</p>
  </main>
}
