import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from '@vector-ui'
import {
  getClientFinancial,
  type ClientFinancialData,
} from '@/services/invoicesApi'

function formatCurrency(amount: number | string, currency = 'USD') {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

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

const RELIABILITY_COLORS: Record<string, { color: string; bg: string }> = {
  Excellent: { color: '#4A5C47', bg: 'rgba(74,92,71,0.2)' },
  Good: { color: '#1652F0', bg: 'rgba(22,82,240,0.12)' },
  Unreliable: { color: '#FF3B30', bg: 'rgba(255,59,48,0.15)' },
  'N/A': { color: '#8A8A8A', bg: 'rgba(138,138,138,0.12)' },
}

export default function ClientProfilePage() {
  const { clientId } = useParams<{ clientId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ClientFinancialData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    try {
      const result = await getClientFinancial(clientId)
      setData(result)
    } catch {
      toast({ title: 'Failed to load client data', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div style={{ padding: '32px', fontFamily: 'var(--font-body)', color: 'var(--color-muted)', fontSize: '13px' }}>Loading client profile...</div>
  }

  if (!data) {
    return <div style={{ padding: '32px', fontFamily: 'var(--font-body)', color: 'var(--color-muted)', fontSize: '14px' }}>Client not found</div>
  }

  const { summary, invoices } = data
  const rel = RELIABILITY_COLORS[summary.reliability_score] || RELIABILITY_COLORS['N/A']

  return (
    <div style={{ padding: '32px', fontFamily: 'var(--font-body)', maxWidth: '900px' }}>
      <button onClick={() => navigate('/clients')} style={{
        background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer',
        fontSize: '12px', letterSpacing: '0.1em', fontWeight: 600, padding: '0',
        marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-body)',
      }}>
        <span style={{ fontSize: '14px' }}>&larr;</span> BACK TO CLIENTS
      </button>

      {/* Client header */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '6px' }}>CLIENT PROFILE</div>
            <h1 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 4px', letterSpacing: '-0.02em' }}>{summary.client_name}</h1>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', padding: '4px 10px',
              background: rel.bg, color: rel.color,
            }}>{summary.reliability_score}</span>
          </div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '1px', background: 'var(--color-border)', marginTop: '20px',
        }}>
          {[
            { label: 'TOTAL BILLED', value: formatCurrency(summary.total_billed), accent: true },
            { label: 'TOTAL PAID', value: formatCurrency(summary.total_paid), color: '#4A5C47' },
            { label: 'OUTSTANDING', value: formatCurrency(summary.total_outstanding), color: summary.total_outstanding > 0 ? '#FF3B30' : undefined },
            { label: 'AVG DAYS TO PAY', value: `${summary.avg_days_to_pay}d` },
            { label: 'INVOICES', value: String(summary.invoice_count) },
          ].map((stat, i) => (
            <div key={i} style={{ background: 'var(--color-surface)', padding: '14px 16px' }}>
              <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--color-muted)', marginBottom: '4px' }}>{stat.label}</div>
              <div style={{
                fontSize: '20px', fontWeight: 700, fontFamily: 'monospace',
                color: stat.color || (stat.accent ? 'var(--color-accent)' : 'var(--color-fg)'),
              }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Invoice history */}
      <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '12px' }}>
        COMPLETE INVOICE HISTORY — {invoices.length} RECORDS
      </div>

      {invoices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)', fontSize: '13px' }}>No invoices for this client</div>
      ) : (
        <div style={{ border: '1px solid var(--color-border)' }}>
          {invoices.map((inv, i) => {
            const sc = STATUS_CONFIG[inv.status] || STATUS_CONFIG['pending']
            return (
              <div
                key={inv.id}
                onClick={() => navigate(`/invoices/${inv.id}`)}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 100px 80px 80px',
                  padding: '14px 16px', borderBottom: i < invoices.length - 1 ? '1px solid var(--color-border)' : 'none',
                  cursor: 'pointer', transition: 'background var(--motion-fast)', alignItems: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>#{inv.invoice_number}</div>
                  <div style={{ fontSize: '10px', color: 'var(--color-muted)' }}>
                    {inv.description || 'No description'} — Due {formatDate(inv.due_date)}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '13px', fontWeight: 700 }}>
                  {formatCurrency(inv.amount)}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{
                    fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em',
                    padding: '3px 6px', background: sc.bg, color: sc.color,
                  }}>{sc.label}</span>
                </div>
                <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--color-muted)' }}>
                  {formatDate(inv.created_at)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
