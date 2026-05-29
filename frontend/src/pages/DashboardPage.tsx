import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@govector/auth'
import { toast } from '@vector-ui'
import {
  getDashboardStats,
  getFinancialOverview,
  getInvoices,
  generateReminder,
  updateReminder,
  sendReminder,
  markPaid,
  uploadCSV,
  retryAllFailed,
  scanInvoice,
  exportInvoicesUrl,
  exportTaxSummaryUrl,
  type Invoice,
  type DashboardStats,
  type ReminderEmail,
  type FinancialData,
  type InvoiceScanResult,
} from '@/services/invoicesApi'

function formatCurrency(amount: number | string, currency = 'USD') {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function formatCurrencyFull(amount: number | string, currency = 'USD') {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n)
}

function urgencyColor(days: number): string {
  if (days <= 7) return '#4A5C47'
  if (days <= 21) return '#F59E0B'
  if (days <= 30) return '#F05A00'
  return '#FF3B30'
}

const STAGE_LABELS = ['', 'Friendly', 'Firm Nudge', 'Formal', 'Final Warning', 'Legal']
const STAGE_COLORS = ['', '#1652F0', '#F59E0B', '#F05A00', '#FF3B30', '#8B0000']

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'DRAFT', color: '#8A8A8A', bg: 'rgba(138,138,138,0.12)' },
  sent: { label: 'SENT', color: '#1652F0', bg: 'rgba(22,82,240,0.12)' },
  pending: { label: 'PENDING', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  partial: { label: 'PARTIAL', color: '#1652F0', bg: 'rgba(22,82,240,0.12)' },
  recovered: { label: 'PAID', color: '#4A5C47', bg: 'rgba(74,92,71,0.2)' },
  overdue: { label: 'OVERDUE', color: '#FF3B30', bg: 'rgba(255,59,48,0.15)' },
  written_off: { label: 'WRITTEN OFF', color: '#8A8A8A', bg: 'rgba(138,138,138,0.12)' },
  disputed: { label: 'DISPUTED', color: '#F05A00', bg: 'rgba(240,90,0,0.15)' },
}


// --- Revenue Bar Chart (taller) ---
function RevenueBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '100%', minHeight: '220px', paddingTop: '16px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
          <div
            title={`${d.label}: ${formatCurrency(d.value)}`}
            style={{
              width: '100%', maxWidth: '36px',
              height: `${Math.max(3, (d.value / max) * 200)}px`,
              background: d.value > 0 ? 'var(--color-accent)' : 'var(--color-border)',
              transition: 'height 0.5s ease-out',
              opacity: d.value > 0 ? 1 : 0.3,
            }}
          />
          <span style={{ fontSize: '9px', color: 'var(--color-muted)', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// --- Donut Chart ---
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-muted)', fontSize: '11px' }}>No data</div>

  let cumulative = 0
  const gradientParts = segments.map(seg => {
    const start = (cumulative / total) * 360
    cumulative += seg.value
    const end = (cumulative / total) * 360
    return `${seg.color} ${start}deg ${end}deg`
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      <div style={{
        width: 130, height: 130, borderRadius: '50%',
        background: `conic-gradient(${gradientParts.join(', ')})`,
        position: 'relative', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', inset: '28px', borderRadius: '50%',
          background: 'var(--color-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column',
        }}>
          <div style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'monospace' }}>{total}</div>
          <div style={{ fontSize: '9px', color: 'var(--color-muted)', letterSpacing: '0.08em' }}>TOTAL</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', justifyContent: 'center' }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px' }}>
            <div style={{ width: 8, height: 8, background: seg.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-secondary)' }}>{seg.label}</span>
            <span style={{ color: 'var(--color-muted)', fontFamily: 'monospace', fontSize: '10px' }}>{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Reminder Modal ---
function ReminderModal({ invoice, onClose, onSent }: { invoice: Invoice; onClose: () => void; onSent: () => void }) {
  const [stage, setStage] = useState(Math.min((invoice.last_reminder_stage ?? 0) + 1, 5))
  const [reminder, setReminder] = useState<ReminderEmail | null>(null)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const generate = async (toneAdjustment?: string) => {
    setGenerating(true)
    try {
      const r = await generateReminder(invoice.id, stage, toneAdjustment)
      setReminder(r)
      setSubject(r.subject)
      setBody(r.body)
    } catch {
      toast({ title: 'Error', description: 'Failed to generate email', variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  const saveAndSend = async () => {
    if (!reminder) return
    setSending(true)
    try {
      await updateReminder(reminder.id, { subject, body })
      await sendReminder(reminder.id)
      toast({ title: 'Email sent', description: `Stage ${stage} reminder sent` })
      onSent()
      onClose()
    } catch {
      toast({ title: 'Send failed', variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        width: '100%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--color-muted)' }}>
            GENERATE REMINDER — {invoice.invoice_number}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '4px' }}>
            {invoice.client.name} — {formatCurrencyFull(invoice.amount)}
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '6px' }}>STAGE</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setStage(s)} style={{
                  flex: 1, padding: '8px 4px', fontSize: '10px', fontWeight: 700,
                  letterSpacing: '0.08em', border: `1px solid ${s === stage ? STAGE_COLORS[s] : 'var(--color-border)'}`,
                  background: s === stage ? `${STAGE_COLORS[s]}20` : 'transparent',
                  color: s === stage ? STAGE_COLORS[s] : 'var(--color-muted)', cursor: 'pointer',
                }}>{STAGE_LABELS[s]}</button>
              ))}
            </div>
          </div>

          {!reminder && (
            <button onClick={() => generate()} disabled={generating} style={{
              width: '100%', padding: '14px', background: 'var(--color-accent)',
              color: 'white', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
            }}>{generating ? 'GENERATING...' : 'GENERATE EMAIL'}</button>
          )}

          {reminder && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '4px' }}>SUBJECT</div>
                <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '4px' }}>BODY</div>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.5' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={saveAndSend} disabled={sending} style={{
                  flex: 1, padding: '12px', background: 'var(--color-accent)', color: 'white',
                  border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
                }}>{sending ? 'SENDING...' : 'SEND EMAIL'}</button>
                <button onClick={() => generate()} disabled={generating} style={{
                  padding: '12px 16px', background: 'transparent', color: 'var(--color-muted)',
                  border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                }}>{generating ? '...' : 'REGENERATE'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Scanner Modal ---
function ScannerModal({ onClose, onScanned }: { onClose: () => void; onScanned: (result: InvoiceScanResult) => void }) {
  const [scanning, setScanning] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<(InvoiceScanResult | { error: string })[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFiles = (fileList: FileList) => {
    setFiles(Array.from(fileList))
    setResults([])
    setCurrentIdx(0)
  }

  const processFiles = async () => {
    setScanning(true)
    const newResults: (InvoiceScanResult | { error: string })[] = []
    for (let i = 0; i < files.length; i++) {
      setCurrentIdx(i)
      try {
        const result = await scanInvoice(files[i])
        newResults.push(result)
      } catch (e: any) {
        newResults.push({ error: e?.response?.data?.error || `Failed to scan ${files[i].name}` })
      }
    }
    setResults(newResults)
    setScanning(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        width: '100%', maxWidth: '650px', maxHeight: '85vh', overflowY: 'auto',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--color-muted)' }}>INVOICE SCANNER</div>
            <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>Upload & Extract</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '20px' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {files.length === 0 && (
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed var(--color-border)', padding: '48px 24px',
                textAlign: 'center', cursor: 'pointer',
                transition: 'border-color var(--motion-fast)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
            >
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>&#128196;</div>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Drop files or click to browse</div>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>PDF (best results), JPG, PNG, WEBP — up to 10MB</div>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                style={{ display: 'none' }}
                onChange={e => e.target.files && handleFiles(e.target.files)}
              />
            </div>
          )}

          {files.length > 0 && results.length === 0 && (
            <div>
              <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '8px' }}>
                {files.length} FILE{files.length > 1 ? 'S' : ''} SELECTED
              </div>
              {files.map((f, i) => (
                <div key={i} style={{
                  padding: '10px 12px', background: '#0F0F0F', border: '1px solid var(--color-border)',
                  marginBottom: '4px', fontSize: '13px', display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>{f.name}</span>
                  <span style={{ color: 'var(--color-muted)', fontSize: '11px' }}>{(f.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
              {scanning && (
                <div style={{ padding: '16px', textAlign: 'center' }}>
                  <div style={{ color: 'var(--color-accent)', fontSize: '13px', fontWeight: 600 }}>
                    Scanning file {currentIdx + 1} of {files.length}...
                  </div>
                  <div style={{ marginTop: '8px', height: '3px', background: 'var(--color-border)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', background: 'var(--color-accent)',
                      width: `${((currentIdx + 1) / files.length) * 100}%`,
                      transition: 'width 0.3s ease-out',
                    }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button onClick={processFiles} disabled={scanning} style={{
                  flex: 1, padding: '12px', background: 'var(--color-accent)', color: 'white',
                  border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
                }}>{scanning ? `SCANNING ${currentIdx + 1}/${files.length}...` : 'SCAN ALL'}</button>
                <button onClick={() => { setFiles([]); setResults([]) }} style={{
                  padding: '12px 16px', background: 'transparent', color: 'var(--color-muted)',
                  border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                }}>CLEAR</button>
              </div>
            </div>
          )}

          {results.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '12px' }}>
                SCAN RESULTS — {results.filter(r => !('error' in r)).length} extracted, {results.filter(r => 'error' in r).length} failed
              </div>
              {results.map((r, i) => (
                <div key={i} style={{
                  padding: '12px', background: '#0F0F0F', border: '1px solid var(--color-border)',
                  marginBottom: '6px',
                }}>
                  {'error' in r ? (
                    <div style={{ color: '#FF3B30', fontSize: '12px' }}>{files[i]?.name}: {r.error}</div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700 }}>
                          {r.extracted.invoice_number || 'No number'} — {r.extracted.client_name || 'Unknown client'}
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-accent)' }}>
                          {r.extracted.amount ? `$${r.extracted.amount.toLocaleString()}` : '—'}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-muted)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {r.extracted.client_email && <span>Email: {r.extracted.client_email}</span>}
                        {r.extracted.due_date && <span>Due: {r.extracted.due_date}</span>}
                        {r.extracted.project_name && <span>Project: {r.extracted.project_name}</span>}
                      </div>
                      {r.extracted.line_items && r.extracted.line_items.length > 0 && (
                        <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                          {r.extracted.line_items.length} line item{r.extracted.line_items.length > 1 ? 's' : ''}
                        </div>
                      )}
                      <button
                        onClick={() => { onScanned(r as InvoiceScanResult); onClose() }}
                        style={{
                          marginTop: '8px', padding: '8px 16px', background: 'var(--color-accent)',
                          color: 'white', border: 'none', cursor: 'pointer',
                          fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
                        }}
                      >SAVE INVOICE</button>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={() => { setFiles([]); setResults([]) }} style={{
                width: '100%', marginTop: '8px', padding: '10px',
                background: 'transparent', color: 'var(--color-muted)',
                border: '1px solid var(--color-border)', cursor: 'pointer',
                fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
              }}>SCAN MORE FILES</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Actions Dropdown ---
function ActionsDropdown({ onImportCSV, onRetryFailed }: { onImportCSV: () => void; onRetryFailed: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        padding: '10px 16px', background: 'transparent',
        border: '1px solid var(--color-border)', color: 'var(--color-muted)',
        cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
        display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        ACTIONS
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '4px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          zIndex: 50, minWidth: '180px',
        }}>
          {[
            { label: 'IMPORT CSV', action: onImportCSV },
            { label: 'RETRY FAILED', action: onRetryFailed },
            { label: 'EXPORT CSV', action: () => window.open(exportInvoicesUrl(), '_blank') },
            { label: 'TAX SUMMARY', action: () => window.open(exportTaxSummaryUrl(), '_blank') },
          ].map((item, i) => (
            <button key={i} onClick={() => { item.action(); setOpen(false) }} style={{
              display: 'block', width: '100%', padding: '10px 16px', textAlign: 'left',
              background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)', cursor: 'pointer',
              fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,90,0,0.06)'; e.currentTarget.style.color = 'var(--color-fg)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
            >{item.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Main Dashboard ---
export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [, setStats] = useState<DashboardStats | null>(null)
  const [financial, setFinancial] = useState<FinancialData | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [reminderInvoice, setReminderInvoice] = useState<Invoice | null>(null)
  const [showCSV, setShowCSV] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [tab, setTab] = useState<'overview' | 'invoices'>('overview')
  const csvRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, f, inv] = await Promise.all([
        getDashboardStats(),
        getFinancialOverview().catch(() => null),
        getInvoices(),
      ])
      setStats(s)
      setFinancial(f)
      setInvoices(inv)
    } catch {
      toast({ title: 'Failed to load dashboard', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCSVUpload = async () => {
    if (!csvFile) return
    setImporting(true)
    try {
      const result = await uploadCSV(csvFile, {})
      toast({
        title: `${result.rows_imported} invoices imported`,
        description: result.rows_failed > 0 ? `${result.rows_failed} rows skipped` : undefined,
      })
      setCsvFile(null)
      setShowCSV(false)
      load()
    } catch {
      toast({ title: 'Import failed', variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  const handleRetryAll = async () => {
    try {
      const r = await retryAllFailed()
      toast({ title: `Retried ${r.total_attempted} emails`, description: `${r.sent} sent, ${r.still_failed} still failed` })
      load()
    } catch {
      toast({ title: 'Retry failed', variant: 'destructive' })
    }
  }

  const handleScanned = (result: InvoiceScanResult) => {
    navigate('/invoices', { state: { scannedResult: result } })
  }

  const handleQuickPay = async (inv: Invoice) => {
    try {
      await markPaid(inv.id)
      toast({ title: 'Marked as paid', description: inv.invoice_number })
      load()
    } catch {
      toast({ title: 'Error', variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '32px', fontFamily: 'var(--font-body)' }}>
        <div style={{ color: 'var(--color-muted)', fontSize: '13px' }}>Loading dashboard...</div>
      </div>
    )
  }

  const overview = financial?.overview
  const monthlyData = financial?.monthly_revenue?.slice(-12) || []
  const statusBreakdown = financial?.status_breakdown || []
  const topClients = financial?.top_clients || []

  const statusColors: Record<string, string> = {
    'Paid': '#4A5C47', 'Recovered': '#4A5C47', 'Pending': '#F59E0B',
    'Partially Paid': '#1652F0', 'Overdue': '#FF3B30', 'Draft': '#8A8A8A',
    'Sent': '#1652F0', 'Written Off': '#555', 'Disputed': '#F05A00',
  }

  const overdueInvoices = invoices.filter(inv => inv.is_overdue)

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--color-muted)' }}>PAYFLOW COMMAND CENTER</div>
          <h1 style={{ fontSize: '28px', fontWeight: 900, margin: '4px 0 0', letterSpacing: '-0.02em' }}>
            {user?.first_name ? `${user.first_name}'s Dashboard` : 'Dashboard'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => setShowScanner(true)} style={{
            padding: '10px 20px', background: 'var(--color-accent)', border: 'none',
            color: 'white', cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
          }}>SCAN INVOICE</button>
          <ActionsDropdown onImportCSV={() => setShowCSV(true)} onRetryFailed={handleRetryAll} />
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '1px solid var(--color-border)' }}>
        {(['overview', 'invoices'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em',
            border: 'none', borderBottom: t === tab ? '2px solid var(--color-accent)' : '2px solid transparent',
            background: 'transparent', color: t === tab ? 'var(--color-fg)' : 'var(--color-muted)',
            cursor: 'pointer', marginBottom: '-1px',
          }}>{t === 'overview' ? 'FINANCIAL OVERVIEW' : 'ALL INVOICES'}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Row 1: Revenue This Month, Revenue This Year, Overdue */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'var(--color-border)', marginBottom: '1px' }}>
            <div style={{ background: 'var(--color-surface)', padding: '24px 28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '8px' }}>REVENUE THIS MONTH</div>
              <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '-0.02em', color: 'var(--color-accent)' }}>
                {formatCurrency(overview?.revenue_this_month || 0)}
              </div>
              {overview?.revenue_change_pct ? (
                <div style={{ fontSize: '11px', color: overview.revenue_change_pct > 0 ? '#4A5C47' : '#FF3B30', marginTop: '4px' }}>
                  {overview.revenue_change_pct > 0 ? '+' : ''}{overview.revenue_change_pct}% vs last month
                </div>
              ) : null}
            </div>
            <div style={{ background: 'var(--color-surface)', padding: '24px 28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '8px' }}>REVENUE THIS YEAR</div>
              <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '-0.02em', color: 'var(--color-fg)' }}>
                {formatCurrency(overview?.revenue_this_year || 0)}
              </div>
            </div>
            <div style={{ background: 'var(--color-surface)', padding: '24px 28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '8px' }}>OVERDUE</div>
              <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '-0.02em', color: '#FF3B30' }}>
                {formatCurrency(overview?.overdue_amount || 0)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
                {overview?.overdue_count || 0} invoice{(overview?.overdue_count || 0) !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Row 2: Outstanding, Recovery Rate, Paid On Time */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'var(--color-border)', marginBottom: '24px' }}>
            <div style={{ background: 'var(--color-surface)', padding: '24px 28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '8px' }}>OUTSTANDING</div>
              <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '-0.02em', color: 'var(--color-fg)' }}>
                {formatCurrency(overview?.outstanding_amount || 0)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
                {overview?.outstanding_count || 0} invoice{(overview?.outstanding_count || 0) !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ background: 'var(--color-surface)', padding: '24px 28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '8px' }}>RECOVERY RATE</div>
              <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '-0.02em', color: 'var(--color-accent)' }}>
                {overview?.recovery_rate || 0}%
              </div>
            </div>
            <div style={{ background: 'var(--color-surface)', padding: '24px 28px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '8px' }}>PAID ON TIME</div>
              <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '-0.02em', color: 'var(--color-fg)' }}>
                {overview?.paid_on_time_rate || 0}%
              </div>
            </div>
          </div>

          {/* Secondary stat line */}
          <div style={{
            display: 'flex', gap: '24px', marginBottom: '24px', padding: '12px 0',
            borderBottom: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--color-muted)' }}>AVG DAYS TO PAY</span>
              <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-fg)' }}>
                {overview?.avg_days_to_payment || 0}d
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--color-muted)' }}>AVG DAYS OVERDUE</span>
              <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', color: (overview?.avg_days_overdue || 0) > 14 ? '#FF3B30' : 'var(--color-fg)' }}>
                {overview?.avg_days_overdue || 0}d
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--color-muted)' }}>RECOVERED THIS MONTH</span>
              <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--color-accent)' }}>
                {formatCurrency(overview?.recovered_this_month || 0)}
              </span>
            </div>
          </div>

          {/* Charts Row — equal thirds */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'var(--color-border)', marginBottom: '24px' }}>
            {/* Monthly Revenue Chart */}
            <div style={{ background: 'var(--color-surface)', padding: '20px', minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '12px' }}>MONTHLY REVENUE — 12 MONTHS</div>
              <div style={{ flex: 1 }}>
                <RevenueBarChart
                  data={monthlyData.map(m => ({
                    label: m.month.slice(5),
                    value: m.revenue,
                  }))}
                />
              </div>
            </div>

            {/* Status Breakdown */}
            <div style={{ background: 'var(--color-surface)', padding: '20px', minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '16px', alignSelf: 'flex-start' }}>INVOICE STATUS</div>
              <DonutChart segments={statusBreakdown.map(s => ({
                label: s.status,
                value: s.count,
                color: statusColors[s.status] || '#8A8A8A',
              }))} />
            </div>

            {/* Top Clients */}
            <div style={{ background: 'var(--color-surface)', padding: '20px', minHeight: '300px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '16px' }}>TOP CLIENTS BY REVENUE</div>
              {topClients.length === 0 && (
                <div style={{ color: 'var(--color-muted)', fontSize: '11px', padding: '20px 0' }}>No revenue data yet</div>
              )}
              {topClients.map((c, i) => {
                const maxRev = topClients[0]?.revenue || 1
                return (
                  <div key={i} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          width: '20px', height: '20px', background: i === 0 ? 'var(--color-accent)' : 'var(--color-border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '10px', fontWeight: 700, color: i === 0 ? '#fff' : 'var(--color-muted)',
                        }}>{i + 1}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>{c.client_name}</span>
                      </div>
                      <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--color-accent)' }}>
                        {formatCurrency(c.revenue)}
                      </span>
                    </div>
                    {/* Revenue bar */}
                    <div style={{ height: '3px', background: 'var(--color-border)', marginLeft: '28px' }}>
                      <div style={{
                        height: '100%', background: i === 0 ? 'var(--color-accent)' : 'rgba(240,90,0,0.4)',
                        width: `${(c.revenue / maxRev) * 100}%`,
                        transition: 'width 0.4s ease-out',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Overdue Invoices Table */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '12px' }}>
              OVERDUE INVOICES — {overdueInvoices.length} TOTAL
            </div>
          </div>

          {overdueInvoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)', fontSize: '13px' }}>
              No overdue invoices
            </div>
          ) : (
            <div style={{ border: '1px solid var(--color-border)', overflow: 'hidden' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '18% 30% 14% 11% 7% 12% 8%',
                padding: '10px 16px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
                color: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)',
                background: '#0A0A0A',
              }}>
                <span>INVOICE</span>
                <span>CLIENT</span>
                <span style={{ textAlign: 'right' }}>AMOUNT</span>
                <span style={{ textAlign: 'center' }}>STATUS</span>
                <span style={{ textAlign: 'center' }}>DAYS</span>
                <span style={{ textAlign: 'center' }}>STAGE</span>
                <span />
              </div>
              {overdueInvoices.slice(0, 15).map(inv => {
                const sc = STATUS_CONFIG[inv.status] || STATUS_CONFIG['pending']
                const stage = inv.last_reminder_stage || 0
                const stageNames = ['None', 'Friendly Reminder', 'Firm Nudge', 'Formal Notice', 'Final Warning', 'Legal Demand']
                const stageDotColors = ['#8A8A8A', '#EF9F27', '#F05A00', '#E24B4A', '#A32D2D']
                return (
                  <div
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    style={{
                      display: 'grid', gridTemplateColumns: '18% 30% 14% 11% 7% 12% 8%',
                      padding: '0 16px', height: '48px',
                      borderBottom: '0.5px solid rgba(255,255,255,0.06)',
                      cursor: 'pointer', transition: 'background 120ms ease-out',
                      alignItems: 'center',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>#{inv.invoice_number}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginTop: '1px' }}>
                        Due {new Date(inv.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.client.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.client.email}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px', fontWeight: 700 }}>
                      {formatCurrencyFull(inv.amount)}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                        padding: '4px 10px', borderRadius: '3px',
                        background: sc.bg, color: sc.color, lineHeight: 1.3,
                      }}>{sc.label}</span>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      {inv.days_overdue > 0 ? (
                        <span style={{
                          fontSize: '12px', fontWeight: 700, fontFamily: 'monospace',
                          color: inv.days_overdue > 21 ? '#FF3B30' : inv.days_overdue > 7 ? '#F05A00' : 'var(--color-muted)',
                        }}>{inv.days_overdue}d</span>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>—</span>
                      )}
                    </div>
                    {/* Escalation stage dots */}
                    <div
                      style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}
                      title={stage > 0 ? `Stage ${stage} of 5 — ${stageNames[stage]}` : 'No emails sent yet'}
                    >
                      {[1, 2, 3, 4, 5].map(s => (
                        <div
                          key={s}
                          style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: s <= stage ? stageDotColors[s - 1] : '#444441',
                            transition: 'background 120ms ease-out',
                          }}
                        />
                      ))}
                    </div>
                    <div onClick={e => e.stopPropagation()}>
                      <RowActionsMenu
                        inv={inv}
                        onReminder={setReminderInvoice}
                        onQuickPay={handleQuickPay}
                        onRowClick={(i) => navigate(`/invoices/${i.id}`)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {tab === 'invoices' && (
        <InvoiceTable
          invoices={invoices}
          onRowClick={inv => navigate(`/invoices/${inv.id}`)}
          onReminder={setReminderInvoice}
          onQuickPay={handleQuickPay}
          emptyMessage="No invoices yet. Create your first invoice or import via CSV."
          showStatusFilter
        />
      )}

      {/* CSV Upload Modal */}
      {showCSV && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }} onClick={e => e.target === e.currentTarget && setShowCSV(false)}>
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            width: '100%', maxWidth: '440px',
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--color-muted)' }}>BATCH IMPORT</div>
              <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>Import CSV</div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div
                onClick={() => csvRef.current?.click()}
                style={{
                  border: '2px dashed var(--color-border)', padding: '32px', textAlign: 'center', cursor: 'pointer',
                  marginBottom: '16px',
                }}
              >
                {csvFile ? (
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{csvFile.name}</div>
                ) : (
                  <>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Click to select CSV file</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>Columns: client_name, client_email, amount, due_date</div>
                  </>
                )}
                <input ref={csvRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => setCsvFile(e.target.files?.[0] || null)} />
              </div>
              <button onClick={handleCSVUpload} disabled={!csvFile || importing} style={{
                width: '100%', padding: '12px', background: 'var(--color-accent)', color: 'white',
                border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
              }}>{importing ? 'IMPORTING...' : 'IMPORT'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Scanner Modal */}
      {showScanner && <ScannerModal onClose={() => setShowScanner(false)} onScanned={handleScanned} />}

      {/* Reminder Modal */}
      {reminderInvoice && <ReminderModal invoice={reminderInvoice} onClose={() => setReminderInvoice(null)} onSent={load} />}
    </div>
  )
}

// --- Row Actions Dropdown ---
function RowActionsMenu({
  inv,
  onReminder,
  onQuickPay,
  onRowClick,
}: {
  inv: Invoice
  onReminder: (inv: Invoice) => void
  onQuickPay: (inv: Invoice) => void
  onRowClick: (inv: Invoice) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const actions: { label: string; action: () => void; color?: string }[] = []
  if (inv.status !== 'recovered' && inv.status !== 'written_off') {
    actions.push({ label: 'Send Email', action: () => onReminder(inv) })
    actions.push({ label: 'Mark Paid', action: () => onQuickPay(inv), color: '#4A5C47' })
  }
  actions.push({ label: 'View Detail', action: () => onRowClick(inv) })
  if (inv.status !== 'recovered' && inv.status !== 'written_off') {
    actions.push({ label: 'Write Off', action: () => onQuickPay(inv), color: '#8A8A8A' })
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--color-muted)', fontSize: '16px', padding: '4px 8px',
          letterSpacing: '2px', lineHeight: 1,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-fg)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-muted)' }}
      >
        ···
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '2px',
          background: '#1A1A1A', border: '1px solid var(--color-border)',
          zIndex: 60, minWidth: '140px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); a.action(); setOpen(false) }}
              style={{
                display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left',
                background: 'transparent', border: 'none',
                borderBottom: i < actions.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                color: a.color || 'var(--color-text-secondary)', cursor: 'pointer',
                fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em',
                fontFamily: 'var(--font-body)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,90,0,0.06)'; e.currentTarget.style.color = 'var(--color-fg)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = a.color || 'var(--color-text-secondary)' }}
            >{a.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Status Filter Dropdown ---
function StatusFilterDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const options = [
    { value: 'all', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'partial', label: 'Partial' },
    { value: 'recovered', label: 'Paid' },
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'disputed', label: 'Disputed' },
    { value: 'written_off', label: 'Written Off' },
  ]

  const selectedLabel = options.find(o => o.value === value)?.label || 'All Statuses'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        padding: '7px 14px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
        border: `1px solid ${value !== 'all' && value !== 'overdue' ? 'var(--color-accent)' : 'var(--color-border)'}`,
        background: value !== 'all' && value !== 'overdue' ? 'rgba(240,90,0,0.08)' : 'transparent',
        color: value !== 'all' && value !== 'overdue' ? 'var(--color-accent)' : 'var(--color-muted)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
      }}>
        {selectedLabel.toUpperCase()}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1.5 3l2.5 2.5L6.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="square"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: '4px',
          background: '#1A1A1A', border: '1px solid var(--color-border)',
          zIndex: 50, minWidth: '160px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              style={{
                display: 'block', width: '100%', padding: '9px 14px', textAlign: 'left',
                background: value === opt.value ? 'rgba(240,90,0,0.08)' : 'transparent',
                border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                color: value === opt.value ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                fontFamily: 'var(--font-body)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(240,90,0,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.background = value === opt.value ? 'rgba(240,90,0,0.08)' : 'transparent' }}
            >{opt.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Invoice Table Component (All Invoices tab) ---
function InvoiceTable({
  invoices,
  onRowClick,
  onReminder,
  onQuickPay,
  emptyMessage,
  showStatusFilter,
}: {
  invoices: Invoice[]
  onRowClick: (inv: Invoice) => void
  onReminder: (inv: Invoice) => void
  onQuickPay: (inv: Invoice) => void
  emptyMessage: string
  showStatusFilter?: boolean
}) {
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = statusFilter === 'all' ? invoices : invoices.filter(inv => inv.status === statusFilter)

  // Column grid: Invoice 15%, Client 30%, Amount 15%, Status 12%, Overdue 8%, Actions 5%
  const gridCols = '15% 30% 15% 12% 8% 5%'

  return (
    <div>
      {showStatusFilter && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', alignItems: 'center' }}>
          {/* Quick-access tabs: ALL and OVERDUE */}
          {[
            { value: 'all', label: 'ALL' },
            { value: 'overdue', label: 'OVERDUE' },
          ].map(t => (
            <button key={t.value} onClick={() => setStatusFilter(t.value)} style={{
              padding: '7px 14px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
              border: `1px solid ${statusFilter === t.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: statusFilter === t.value ? 'rgba(240,90,0,0.1)' : 'transparent',
              color: statusFilter === t.value ? 'var(--color-accent)' : 'var(--color-muted)',
              cursor: 'pointer',
            }}>{t.label}</button>
          ))}

          {/* Dropdown for all other statuses */}
          <StatusFilterDropdown
            value={statusFilter}
            onChange={setStatusFilter}
          />

          <div style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-muted)', fontFamily: 'monospace' }}>
            {filtered.length} invoice{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--color-muted)', fontSize: '13px' }}>
          {emptyMessage}
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ border: '1px solid var(--color-border)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: gridCols,
            padding: '12px 20px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
            color: 'var(--color-muted)', borderBottom: '1px solid var(--color-border)',
            background: '#0A0A0A',
          }}>
            <span>INVOICE</span>
            <span>CLIENT</span>
            <span style={{ textAlign: 'right' }}>AMOUNT</span>
            <span style={{ textAlign: 'center' }}>STATUS</span>
            <span style={{ textAlign: 'center' }}>DAYS</span>
            <span />
          </div>

          {/* Rows */}
          {filtered.map(inv => {
            const sc = STATUS_CONFIG[inv.status] || STATUS_CONFIG['pending']
            return (
              <div
                key={inv.id}
                onClick={() => onRowClick(inv)}
                style={{
                  display: 'grid', gridTemplateColumns: gridCols,
                  padding: '0 20px', height: '56px',
                  borderBottom: '0.5px solid rgba(255,255,255,0.06)',
                  cursor: 'pointer',
                  transition: 'background 120ms ease-out',
                  alignItems: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {/* Invoice # + due date */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    #{inv.invoice_number}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginTop: '1px' }}>
                    Due {new Date(inv.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>

                {/* Client name + email */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {inv.client.name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-muted)', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {inv.client.email}
                  </div>
                </div>

                {/* Amount */}
                <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px', fontWeight: 700 }}>
                  {formatCurrencyFull(inv.amount)}
                </div>

                {/* Status pill */}
                <div style={{ textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
                    padding: '3px 8px',
                    borderRadius: '2px',
                    background: sc.bg, color: sc.color,
                    lineHeight: 1.3,
                  }}>{sc.label}</span>
                </div>

                {/* Overdue days */}
                <div style={{ textAlign: 'center' }}>
                  {inv.days_overdue > 0 ? (
                    <span style={{
                      fontSize: '12px', fontWeight: 700, fontFamily: 'monospace',
                      color: urgencyColor(inv.days_overdue),
                    }}>{inv.days_overdue}d</span>
                  ) : (
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.15)' }}>—</span>
                  )}
                </div>

                {/* Actions "..." menu */}
                <RowActionsMenu
                  inv={inv}
                  onReminder={onReminder}
                  onQuickPay={onQuickPay}
                  onRowClick={onRowClick}
                />
              </div>
            )
          })}
        </div>
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
