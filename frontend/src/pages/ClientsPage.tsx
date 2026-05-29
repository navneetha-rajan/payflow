import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '@vector-ui'
import {
  getClients,
  createClient,
  updateClient,
  deleteClient,
  type Client,
} from '@/services/invoicesApi'

const RELATIONSHIP_OPTIONS = [
  { value: 'new', label: 'New', color: '#1652F0', bg: 'rgba(22,82,240,0.12)' },
  { value: 'repeat', label: 'Repeat', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  { value: 'vip', label: 'VIP', color: '#F05A00', bg: 'rgba(240,90,0,0.15)' },
]

function RelationshipBadge({ type }: { type: Client['relationship_type'] }) {
  const opt = RELATIONSHIP_OPTIONS.find(o => o.value === type) || RELATIONSHIP_OPTIONS[0]
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
      padding: '3px 8px', color: opt.color, background: opt.bg,
    }}>
      {opt.label.toUpperCase()}
    </span>
  )
}

function ClientModal({
  client,
  onClose,
  onSaved,
}: {
  client?: Client | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: client?.name || '',
    email: client?.email || '',
    company: client?.company || '',
    relationship_type: (client?.relationship_type || 'new') as Client['relationship_type'],
    notes: client?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const update = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    if (!form.name || !form.email) {
      toast({ title: 'Name and email are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      if (client) {
        await updateClient(client.id, form)
        toast({ title: 'Client updated' })
      } else {
        await createClient(form)
        toast({ title: 'Client added', description: form.name })
      }
      onSaved()
      onClose()
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.email?.[0] || 'Failed to save client', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        width: '100%', maxWidth: '440px',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--color-muted)', marginBottom: '2px' }}>
              {client ? 'EDIT CLIENT' : 'NEW CLIENT'}
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>
              {client ? client.name : 'Add Client'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '20px' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { label: 'NAME', key: 'name', type: 'text', placeholder: 'Jane Doe' },
            { label: 'EMAIL', key: 'email', type: 'email', placeholder: 'jane@company.com' },
            { label: 'COMPANY (OPTIONAL)', key: 'company', type: 'text', placeholder: 'Acme Inc.' },
          ].map(f => (
            <div key={f.key}>
              <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '5px' }}>{f.label}</div>
              <input
                type={f.type}
                value={form[f.key as keyof typeof form]}
                onChange={e => update(f.key, e.target.value)}
                placeholder={f.placeholder}
                style={inputStyle}
              />
            </div>
          ))}

          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '6px' }}>RELATIONSHIP TYPE</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {RELATIONSHIP_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => update('relationship_type', opt.value)}
                  style={{
                    flex: 1, padding: '8px',
                    fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                    border: `1px solid ${form.relationship_type === opt.value ? opt.color : 'var(--color-border)'}`,
                    background: form.relationship_type === opt.value ? opt.bg : 'transparent',
                    color: form.relationship_type === opt.value ? opt.color : 'var(--color-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {opt.label.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '5px' }}>NOTES (OPTIONAL)</div>
            <textarea
              value={form.notes}
              onChange={e => update('notes', e.target.value)}
              placeholder="Payment history, preferences..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-body)' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
            <button onClick={handleSubmit} disabled={saving} style={{
              flex: 1, padding: '12px', background: 'var(--color-accent)',
              color: 'white', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
            }}>
              {saving ? 'SAVING...' : client ? 'SAVE CHANGES' : 'ADD CLIENT'}
            </button>
            <button onClick={onClose} style={{
              padding: '12px 16px', background: 'transparent', color: 'var(--color-muted)',
              border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
            }}>CANCEL</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ClientsPage() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [modalClient, setModalClient] = useState<Client | null | undefined>(undefined) // undefined = closed
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const cls = await getClients()
      setClients(cls)
    } catch {
      toast({ title: 'Error loading clients', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (client: Client) => {
    if (!confirm(`Delete ${client.name}? This will fail if they have invoices.`)) return
    try {
      await deleteClient(client.id)
      toast({ title: 'Client deleted' })
      load()
    } catch (_e: any) {
      toast({ title: 'Cannot delete', description: 'Client has existing invoices', variant: 'destructive' })
    }
  }

  const filtered = clients.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()) || c.company.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || c.relationship_type === filter
    return matchSearch && matchFilter
  })

  return (
    <div style={{ padding: '32px', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '6px' }}>CLIENT MANAGEMENT</div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>
            Clients <span style={{ fontSize: '16px', color: 'var(--color-muted)', fontWeight: 400 }}>({clients.length})</span>
          </h1>
        </div>
        <button onClick={() => setModalClient(null)} style={{
          padding: '10px 20px', background: 'var(--color-accent)',
          border: 'none', color: 'white', cursor: 'pointer',
          fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
        }}>
          + ADD CLIENT
        </button>
      </div>

      {/* Search + filter */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients..."
          style={{ ...inputStyle, maxWidth: '280px', flexShrink: 0 }}
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          {['all', 'new', 'repeat', 'vip'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 12px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
                border: `1px solid ${filter === f ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: filter === f ? 'rgba(240,90,0,0.1)' : 'transparent',
                color: filter === f ? 'var(--color-accent)' : 'var(--color-muted)',
                cursor: 'pointer',
              }}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Client grid */}
      {loading && <div style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '60px', fontSize: '13px' }}>Loading...</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>👤</div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
            {search || filter !== 'all' ? 'No clients match your search' : 'No clients yet'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
            {!search && filter === 'all' ? 'Add your first client to get started' : 'Try adjusting your search or filter'}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1px', background: 'var(--color-border)' }}>
        {filtered.map(client => (
          <div
            key={client.id}
            style={{
              background: 'var(--color-surface)',
              padding: '20px',
              position: 'relative',
            }}
          >
            {/* Accent line */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
              background: client.relationship_type === 'vip' ? 'var(--color-accent)' :
                client.relationship_type === 'repeat' ? '#F59E0B' : '#1652F0',
            }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px',
                  background: 'var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: 700, color: 'var(--color-muted)',
                  flexShrink: 0,
                }}>
                  {client.name[0]?.toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-fg)' }}>{client.name}</div>
                  {client.company && <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '1px' }}>{client.company}</div>}
                </div>
              </div>
              <RelationshipBadge type={client.relationship_type} />
            </div>

            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--color-muted)' }}>✉</span> {client.email}
            </div>

            {client.notes && (
              <div style={{
                fontSize: '11px', color: 'var(--color-muted)',
                marginTop: '8px', lineHeight: 1.5,
                overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {client.notes}
              </div>
            )}

            <div style={{ display: 'flex', gap: '6px', marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
              <button
                onClick={() => navigate(`/clients/${client.id}`)}
                style={{
                  flex: 1, padding: '7px',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                  border: '1px solid var(--color-accent)',
                  background: 'rgba(240,90,0,0.08)', color: 'var(--color-accent)',
                  cursor: 'pointer',
                }}
              >
                VIEW PROFILE
              </button>
              <button
                onClick={() => setModalClient(client)}
                style={{
                  padding: '7px 12px',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                  border: '1px solid var(--color-border)',
                  background: 'transparent', color: 'var(--color-muted)',
                  cursor: 'pointer',
                }}
              >
                EDIT
              </button>
              <button
                onClick={() => handleDelete(client)}
                style={{
                  padding: '7px 12px',
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                  border: '1px solid rgba(255,59,48,0.3)',
                  background: 'transparent', color: '#FF3B30',
                  cursor: 'pointer',
                }}
              >
                DELETE
              </button>
            </div>
          </div>
        ))}
      </div>

      {modalClient !== undefined && (
        <ClientModal
          client={modalClient}
          onClose={() => setModalClient(undefined)}
          onSaved={load}
        />
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: '#0F0F0F',
  border: '1px solid var(--color-border)',
  color: 'var(--color-fg)',
  fontSize: '13px',
  fontFamily: 'var(--font-body)',
  outline: 'none',
  boxSizing: 'border-box',
}
