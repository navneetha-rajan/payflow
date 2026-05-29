import { useState, useEffect, useCallback } from 'react'
import { toast } from '@vector-ui'
import {
  getInvoices,
  getClients,
  createInvoice,
  deleteInvoice,
  markPaid,
  uploadCSV,
  type Invoice,
  type Client,
} from '@/services/invoicesApi'

function formatCurrency(amount: number | string, currency = 'USD') {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n)
}

function StatusBadge({ status }: { status: Invoice['status'] }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: 'DRAFT', color: '#8A8A8A', bg: 'rgba(138,138,138,0.12)' },
    sent: { label: 'SENT', color: '#1652F0', bg: 'rgba(22,82,240,0.12)' },
    pending: { label: 'PENDING', color: 'var(--color-muted)', bg: 'rgba(255,255,255,0.06)' },
    partial: { label: 'PARTIAL', color: '#1652F0', bg: 'rgba(22,82,240,0.12)' },
    recovered: { label: 'PAID', color: '#4A5C47', bg: 'rgba(74,92,71,0.2)' },
    overdue: { label: 'OVERDUE', color: '#FF3B30', bg: 'rgba(255,59,48,0.15)' },
    written_off: { label: 'WRITTEN OFF', color: 'var(--color-muted)', bg: 'rgba(255,255,255,0.04)' },
    disputed: { label: 'DISPUTED', color: '#F05A00', bg: 'rgba(240,90,0,0.15)' },
  }
  const { label, color, bg } = config[status] || config['pending']
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', padding: '3px 7px', background: bg, color }}>
      {label}
    </span>
  )
}

// --- Add Invoice Modal ---
function AddInvoiceModal({ clients, onClose, onAdded }: {
  clients: Client[]
  onClose: () => void
  onAdded: () => void
}) {
  const [form, setForm] = useState({
    client_id: '',
    invoice_number: '',
    amount: '',
    currency: 'USD',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
    description: '',
  })
  const [saving, setSaving] = useState(false)

  const update = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  const handleSubmit = async () => {
    if (!form.client_id || !form.invoice_number || !form.amount || !form.due_date) {
      toast({ title: 'Missing fields', description: 'Client, invoice number, amount, and due date are required', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      await createInvoice({
        ...form,
        amount: parseFloat(form.amount),
      })
      toast({ title: 'Invoice created', description: `${form.invoice_number} added` })
      onAdded()
      onClose()
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.detail || 'Failed to create invoice', variant: 'destructive' })
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
        width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--color-muted)', marginBottom: '2px' }}>NEW INVOICE</div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>Add Invoice</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '20px' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {([
            {
              label: 'CLIENT', key: 'client_id', type: 'select' as const,
              options: clients.map(c => ({ value: c.id, label: c.name + (c.company ? ` — ${c.company}` : '') })),
              placeholder: 'Select a client...',
            },
            { label: 'INVOICE NUMBER', key: 'invoice_number', type: 'text' as const, placeholder: 'e.g. INV-0042' },
            { label: 'AMOUNT', key: 'amount', type: 'number' as const, placeholder: '0.00' },
            {
              label: 'CURRENCY', key: 'currency', type: 'select' as const,
              options: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(v => ({ value: v, label: v })),
            },
            { label: 'ISSUE DATE', key: 'issue_date', type: 'date' as const, placeholder: '' },
            { label: 'DUE DATE', key: 'due_date', type: 'date' as const, placeholder: '' },
            { label: 'DESCRIPTION (OPTIONAL)', key: 'description', type: 'textarea' as const, placeholder: 'Project details...' },
          ] as const).map(field => (
            <div key={field.key}>
              <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '5px' }}>{field.label}</div>
              {field.type === 'select' ? (
                <select
                  value={form[field.key]}
                  onChange={e => update(field.key, e.target.value)}
                  style={inputStyle}
                >
                  {'placeholder' in field && <option value="">{field.placeholder}</option>}
                  {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  value={form[field.key]}
                  onChange={e => update(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'var(--font-body)' }}
                />
              ) : (
                <input
                  type={field.type}
                  value={form[field.key]}
                  onChange={e => update(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  style={inputStyle}
                />
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
            <button onClick={handleSubmit} disabled={saving} style={{
              flex: 1, padding: '12px', background: 'var(--color-accent)',
              color: 'white', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
            }}>
              {saving ? 'ADDING...' : 'ADD INVOICE'}
            </button>
            <button onClick={onClose} style={{
              padding: '12px 16px', background: 'transparent', color: 'var(--color-muted)',
              border: '1px solid var(--color-border)', cursor: 'pointer',
              fontSize: '11px', fontWeight: 600,
            }}>CANCEL</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- CSV Upload Modal ---
function CSVModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [mapping, setMapping] = useState({
    col_client_name: 'Client Name',
    col_client_email: 'Client Email',
    col_invoice_number: 'Invoice Number',
    col_amount: 'Amount',
    col_due_date: 'Due Date',
  })
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ rows_imported: number; rows_failed: number; errors: string[] } | null>(null)

  const handleUpload = async () => {
    if (!file) {
      toast({ title: 'No file selected', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      const res = await uploadCSV(file, mapping)
      setResult(res)
      if (res.rows_imported > 0) onImported()
      toast({ title: `Imported ${res.rows_imported} invoices`, description: res.rows_failed > 0 ? `${res.rows_failed} rows failed` : undefined })
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--color-muted)', marginBottom: '2px' }}>CSV IMPORT</div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>Upload Invoices</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '20px' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!result ? (
            <>
              <div>
                <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '6px' }}>CSV FILE</div>
                <div
                  onClick={() => document.getElementById('csv-file-input')?.click()}
                  style={{
                    border: '2px dashed var(--color-border)',
                    padding: '24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: file ? 'rgba(240,90,0,0.05)' : 'transparent',
                    transition: 'all var(--motion-fast)',
                  }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>📄</div>
                  <div style={{ fontSize: '13px', color: file ? 'var(--color-fg)' : 'var(--color-muted)' }}>
                    {file ? file.name : 'Click to select CSV file'}
                  </div>
                  {file && <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>{(file.size / 1024).toFixed(1)} KB</div>}
                </div>
                <input id="csv-file-input" type="file" accept=".csv" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>

              <div>
                <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '8px' }}>COLUMN MAPPING (enter your CSV column headers)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(mapping).map(([key, val]) => {
                    const label = key.replace('col_', '').replace(/_/g, ' ').toUpperCase()
                    return (
                      <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <div style={{ width: '140px', fontSize: '11px', color: 'var(--color-muted)', flexShrink: 0 }}>{label}</div>
                        <input
                          value={val}
                          onChange={e => setMapping(m => ({ ...m, [key]: e.target.value }))}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleUpload} disabled={uploading || !file} style={{
                  flex: 1, padding: '12px', background: !file || uploading ? 'var(--color-border)' : 'var(--color-accent)',
                  color: 'white', border: 'none', cursor: !file || uploading ? 'not-allowed' : 'pointer',
                  fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
                }}>
                  {uploading ? 'IMPORTING...' : 'IMPORT CSV'}
                </button>
                <button onClick={onClose} style={{
                  padding: '12px 16px', background: 'transparent', color: 'var(--color-muted)',
                  border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                }}>CANCEL</button>
              </div>
            </>
          ) : (
            <>
              <div style={{
                padding: '20px',
                background: '#0F0F0F',
                border: `1px solid ${result.rows_imported > 0 ? '#4A5C47' : '#FF3B30'}`,
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '32px', fontWeight: 700, fontFamily: 'monospace', color: result.rows_imported > 0 ? '#4A5C47' : 'var(--color-muted)', marginBottom: '4px' }}>
                  {result.rows_imported}
                </div>
                <div style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--color-muted)' }}>INVOICES IMPORTED</div>
                {result.rows_failed > 0 && (
                  <div style={{ fontSize: '12px', color: '#FF3B30', marginTop: '8px' }}>{result.rows_failed} rows failed</div>
                )}
              </div>
              {result.errors.length > 0 && (
                <div style={{ background: '#0F0F0F', border: '1px solid var(--color-border)', padding: '12px 16px', maxHeight: '160px', overflowY: 'auto' }}>
                  {result.errors.map((e, i) => <div key={i} style={{ fontSize: '11px', color: '#FF3B30', marginBottom: '4px', fontFamily: 'monospace' }}>{e}</div>)}
                </div>
              )}
              <button onClick={onClose} style={{
                padding: '12px', background: 'var(--color-accent)', color: 'white',
                border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
              }}>DONE</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Main Page ---
export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [showCSV, setShowCSV] = useState(false)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [invs, cls] = await Promise.all([
        getInvoices(statusFilter !== 'all' ? { status: statusFilter } : {}),
        getClients(),
      ])
      setInvoices(invs)
      setClients(cls)
    } catch {
      toast({ title: 'Error loading invoices', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const handleDelete = async (inv: Invoice) => {
    if (!confirm(`Delete invoice ${inv.invoice_number}? This cannot be undone.`)) return
    try {
      await deleteInvoice(inv.id)
      toast({ title: 'Invoice deleted' })
      load()
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' })
    }
    setActionMenuId(null)
  }

  const handleMarkPaid = async (inv: Invoice) => {
    try {
      await markPaid(inv.id)
      toast({ title: 'Marked as paid' })
      load()
    } catch {
      toast({ title: 'Error', variant: 'destructive' })
    }
    setActionMenuId(null)
  }

  const statusOptions = ['all', 'pending', 'partial', 'recovered', 'written_off']

  return (
    <div style={{ padding: '32px', fontFamily: 'var(--font-body)' }} onClick={() => setActionMenuId(null)}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '6px' }}>INVOICE MANAGEMENT</div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>Invoices</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowCSV(true)} style={{
            padding: '10px 16px', background: 'transparent',
            border: '1px solid var(--color-border)', color: 'var(--color-muted)',
            cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
          }}>
            ↑ IMPORT CSV
          </button>
          <button onClick={() => setShowAdd(true)} style={{
            padding: '10px 20px', background: 'var(--color-accent)',
            border: 'none', color: 'white',
            cursor: 'pointer', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
          }}>
            + ADD INVOICE
          </button>
        </div>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {statusOptions.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '6px 12px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
              border: `1px solid ${statusFilter === s ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: statusFilter === s ? 'rgba(240,90,0,0.1)' : 'transparent',
              color: statusFilter === s ? 'var(--color-accent)' : 'var(--color-muted)',
              cursor: 'pointer',
            }}
          >
            {s === 'all' ? 'ALL' : s === 'written_off' ? 'WRITTEN OFF' : s.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 140px 100px 100px 80px 90px 80px',
          padding: '10px 16px',
          background: '#0A0A0A',
          borderBottom: '1px solid var(--color-border)',
        }}>
          {['CLIENT / INVOICE', 'AMOUNT', 'ISSUED', 'DUE DATE', 'OVERDUE', 'STATUS', 'ACTIONS'].map(h => (
            <div key={h} style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--color-muted)', fontWeight: 600 }}>{h}</div>
          ))}
        </div>

        {loading && <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>Loading...</div>}

        {!loading && invoices.length === 0 && (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>No invoices yet</div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Add your first invoice or import a CSV</div>
          </div>
        )}

        {!loading && invoices.map((inv, idx) => (
          <div
            key={inv.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 140px 100px 100px 80px 90px 80px',
              padding: '14px 16px',
              borderBottom: idx < invoices.length - 1 ? '1px solid var(--color-border)' : 'none',
              alignItems: 'center',
              background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{inv.client.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px', fontFamily: 'monospace' }}>#{inv.invoice_number}</div>
              {inv.description && <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{inv.description}</div>}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace' }}>{formatCurrency(inv.amount, inv.currency)}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
              {new Date(inv.issue_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
              {new Date(inv.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
            </div>
            <div>
              {inv.days_overdue > 0 ? (
                <span style={{
                  fontSize: '12px', fontWeight: 700,
                  color: inv.days_overdue > 30 ? '#FF3B30' : inv.days_overdue > 21 ? '#F05A00' : inv.days_overdue > 7 ? '#F59E0B' : '#4A5C47',
                  fontFamily: 'monospace',
                }}>
                  {inv.days_overdue}d
                </span>
              ) : <span style={{ fontSize: '11px', color: '#4A5C47' }}>—</span>}
            </div>
            <div><StatusBadge status={inv.status} /></div>
            <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setActionMenuId(actionMenuId === inv.id ? null : inv.id)}
                style={{
                  padding: '5px 8px', fontSize: '11px', background: 'transparent',
                  border: '1px solid var(--color-border)', color: 'var(--color-muted)', cursor: 'pointer',
                }}
              >
                ▾
              </button>
              {actionMenuId === inv.id && (
                <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '2px', background: '#0F0F0F', border: '1px solid var(--color-border)', zIndex: 20, minWidth: '140px' }}>
                  {inv.status !== 'recovered' && (
                    <button onClick={() => handleMarkPaid(inv)} style={menuBtn}>✓ Mark Paid</button>
                  )}
                  <button onClick={() => handleDelete(inv)} style={{ ...menuBtn, color: '#FF3B30' }}>✕ Delete</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAdd && <AddInvoiceModal clients={clients} onClose={() => setShowAdd(false)} onAdded={load} />}
      {showCSV && <CSVModal onClose={() => setShowCSV(false)} onImported={load} />}
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

const menuBtn: React.CSSProperties = {
  display: 'block', width: '100%', padding: '9px 14px',
  textAlign: 'left', fontSize: '12px', color: 'var(--color-text-secondary)',
  background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-border)',
  cursor: 'pointer', fontFamily: 'var(--font-body)',
}
