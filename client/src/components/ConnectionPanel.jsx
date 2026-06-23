import React, { useState, useEffect } from 'react'

export default function ConnectionPanel({
  connections, loading, selectedId, onSelect, onSave, onDelete, onReload, disabled,
}) {
  const [tab, setTab] = useState('manual')
  const [manual, setManual] = useState({ label: '', instanceUrl: '', accessToken: '' })
  const [oauth, setOAuth] = useState({ label: '', instanceUrl: '', clientId: '', clientSecret: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showToken, setShowToken] = useState(false)

  // Listen for OAuth popup postMessage
  useEffect(() => {
    function onMessage(e) {
      if (e.data?.type === 'SF_OAUTH_SUCCESS') {
        onReload()
        if (e.data.connectionId) onSelect(e.data.connectionId)
        setError(null)
      } else if (e.data?.type === 'SF_OAUTH_ERROR') {
        setError(e.data.error)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onReload, onSelect])

  async function handleManualSave(e) {
    e.preventDefault()
    if (!manual.label || !manual.instanceUrl || !manual.accessToken) return
    setSaving(true)
    setError(null)
    try {
      await onSave(manual)
      setManual({ label: '', instanceUrl: '', accessToken: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleOAuthStart(e) {
    e.preventDefault()
    if (!oauth.instanceUrl || !oauth.clientId) return
    const params = new URLSearchParams({
      instanceUrl: oauth.instanceUrl.trim(),
      clientId: oauth.clientId.trim(),
      label: oauth.label.trim() || oauth.instanceUrl.trim(),
      ...(oauth.clientSecret.trim() && { clientSecret: oauth.clientSecret.trim() }),
    })
    window.open(`/api/oauth/start?${params}`, 'sf-oauth', 'width=860,height=640,left=200,top=100')
  }

  const callbackUrl = `${window.location.origin}/api/oauth/callback`

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <span>Salesforce Connection</span>
        <button onClick={onReload} className="text-xs text-sf-blue hover:underline">Reload</button>
      </div>
      <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: saved connections list */}
        <div>
          <div className="label mb-2">Saved Connections</div>
          {loading && <p className="text-sm text-gray-400 italic">Loading…</p>}
          {!loading && connections.length === 0 && (
            <p className="text-sm text-gray-400 italic">No saved connections — add one on the right.</p>
          )}
          <div className="space-y-1.5">
            {connections.map(c => (
              <div
                key={c.id}
                onClick={() => !disabled && onSelect(c.id === selectedId ? null : c.id)}
                className={`flex items-center justify-between px-3 py-2.5 rounded border cursor-pointer transition-colors select-none ${
                  selectedId === c.id
                    ? 'border-sf-blue bg-sf-light'
                    : 'border-sf-border bg-white hover:bg-gray-50'
                } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{c.label}</div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">{c.instanceUrl}</div>
                  <div className="flex gap-2 mt-1">
                    {c.hasToken && (
                      <span className="text-xs text-green-600 font-medium">● Token</span>
                    )}
                    {c.hasRefreshToken && (
                      <span className="text-xs text-blue-500 font-medium">⟳ Refresh</span>
                    )}
                    {c.hasOAuth && (
                      <span className="text-xs text-purple-500 font-medium">OAuth</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  {selectedId === c.id && (
                    <span className="text-sf-blue font-bold text-sm">✓</span>
                  )}
                  <button
                    onClick={ev => { ev.stopPropagation(); onDelete(c.id) }}
                    className="text-gray-300 hover:text-red-400 transition-colors text-xs px-1 py-0.5 leading-none"
                    title="Remove connection"
                    disabled={disabled}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: add new connection */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="label">Add Connection</div>
            <div className="flex rounded border border-sf-border overflow-hidden text-xs">
              <button
                className={`px-3 py-1 transition-colors ${tab === 'manual' ? 'bg-sf-blue text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => setTab('manual')}
              >Manual</button>
              <button
                className={`px-3 py-1 transition-colors ${tab === 'oauth' ? 'bg-sf-blue text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                onClick={() => setTab('oauth')}
              >OAuth</button>
            </div>
          </div>

          {error && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs">
              {error}
            </div>
          )}

          {tab === 'manual' && (
            <form onSubmit={handleManualSave} className="space-y-2.5">
              <div>
                <label className="label">Label</label>
                <input
                  className="input"
                  value={manual.label}
                  onChange={e => setManual(p => ({ ...p, label: e.target.value }))}
                  placeholder="Production Org"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="label">Instance URL</label>
                <input
                  className="input"
                  value={manual.instanceUrl}
                  onChange={e => setManual(p => ({ ...p, instanceUrl: e.target.value }))}
                  placeholder="https://myorg.my.salesforce.com"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="label">Access Token</label>
                <div className="relative">
                  <input
                    className="input pr-14 font-mono text-xs"
                    type={showToken ? 'text' : 'password'}
                    value={manual.accessToken}
                    onChange={e => setManual(p => ({ ...p, accessToken: e.target.value }))}
                    placeholder="00D…"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                  >
                    {showToken ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                className="btn-primary w-full text-sm"
                disabled={saving || !manual.label || !manual.instanceUrl || !manual.accessToken}
              >
                {saving ? 'Saving…' : 'Save Connection'}
              </button>
            </form>
          )}

          {tab === 'oauth' && (
            <form onSubmit={handleOAuthStart} className="space-y-2.5">
              <div>
                <label className="label">Label</label>
                <input
                  className="input"
                  value={oauth.label}
                  onChange={e => setOAuth(p => ({ ...p, label: e.target.value }))}
                  placeholder="Production Org"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="label">Instance URL</label>
                <input
                  className="input"
                  value={oauth.instanceUrl}
                  onChange={e => setOAuth(p => ({ ...p, instanceUrl: e.target.value }))}
                  placeholder="https://myorg.my.salesforce.com"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="label">Consumer Key (Client ID)</label>
                <input
                  className="input font-mono text-xs"
                  value={oauth.clientId}
                  onChange={e => setOAuth(p => ({ ...p, clientId: e.target.value }))}
                  placeholder="3MVG9…"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="label">Consumer Secret <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                <input
                  className="input font-mono text-xs"
                  type="password"
                  value={oauth.clientSecret}
                  onChange={e => setOAuth(p => ({ ...p, clientSecret: e.target.value }))}
                  placeholder="leave blank if not required"
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                className="btn-primary w-full text-sm"
                disabled={!oauth.instanceUrl || !oauth.clientId}
              >
                Login with Salesforce ↗
              </button>
              <p className="text-xs text-gray-400 leading-relaxed">
                Opens a Salesforce login popup. In your Connected App, add this as an allowed callback URL:
                <br />
                <code className="bg-gray-100 px-1 rounded text-gray-600 break-all">{callbackUrl}</code>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
