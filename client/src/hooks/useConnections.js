import { useState, useCallback, useEffect } from 'react'

export function useConnections() {
  const [connections, setConnections] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/connections')
      setConnections(await r.json())
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { reload() }, [reload])

  const save = useCallback(async (conn) => {
    const r = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conn),
    })
    if (!r.ok) {
      const body = await r.json().catch(() => ({}))
      throw new Error(body.error || 'Failed to save connection')
    }
    await reload()
    return r.json()
  }, [reload])

  const remove = useCallback(async (id) => {
    await fetch(`/api/connections/${id}`, { method: 'DELETE' })
    await reload()
  }, [reload])

  return { connections, loading, save, remove, reload }
}
