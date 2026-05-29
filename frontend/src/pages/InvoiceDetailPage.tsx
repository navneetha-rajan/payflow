import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from '@vector-ui'
import {
  getInvoice,
  getInvoiceReminders,
  getEscalationRules,
  generateReminder,
  updateReminder,
  sendReminder,
  markPaid,
  markPartial,
  markDisputed,
  writeOff,
  getDocumentUrl,
  type Invoice,
  type ReminderEmail,
  type EscalationRules,
} from '@/services/invoicesApi'

function formatCurrency(amount: number | string, currency = 'USD') {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const STAGE_LABELS = ['', 'Friendly Reminder', 'Firm Nudge', 'Formal Notice', 'Final Warning', 'Legal Demand']
const STAGE_COLORS = ['', '#1652F0', '#F59E0B', '#F05A00', '#FF3B30', '#8B0000']
const STAGE_DESCRIPTIONS = [
  '',
  'Warm, understanding tone — assume they just forgot',
  'Professional tone — note the invoice is now overdue',
  'Serious and direct — mention potential consequences',
  'Urgent — state that legal action is being considered',
  'Formal legal language — demand immediate payment',
]

function getReminderStatusConfig(reminderStatus: string, isUpcoming: boolean) {
  if (isUpcoming) return { label: 'UPCOMING', color: 'var(--color-muted)', bg: 'rgba(255,255,255,0.04)' }
  if (reminderStatus === 'sent') return { label: 'SENT', color: '#4A5C47', bg: 'rgba(74,92,71,0.2)' }
  if (reminderStatus === 'failed') return { label: 'FAILED', color: '#FF3B30', bg: 'rgba(255,59,48,0.15)' }
  if (reminderStatus === 'draft') return { label: 'DRAFT', color: '#1652F0', bg: 'rgba(22,82,240,0.12)' }
  if (reminderStatus === 'paused') return { label: 'PAUSED', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' }
  return { label: 'UPCOMING', color: 'var(--color-muted)', bg: 'rgba(255,255,255,0.04)' }
}

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
]

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [reminders, setReminders] = useState<ReminderEmail[]>([])
  const [rules, setRules] = useState<EscalationRules | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedStage, setExpandedStage] = useState<number | null>(null)
  const [generatingStage, setGeneratingStage] = useState<number | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const [payType, setPayType] = useState<'full' | 'partial'>('full')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('other')
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [payNotes, setPayNotes] = useState('')
  const [paying, setPaying] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [inv, rems, esc] = await Promise.all([
        getInvoice(id),
        getInvoiceReminders(id),
        getEscalationRules(),
      ])
      setInvoice(inv)
      setReminders(Array.isArray(rems) ? rems : [])
      setRules(esc)
    } catch {
      toast({ title: 'Error', description: 'Failed to load invoice details', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const handleGenerate = async (stage: number) => {
    if (!invoice) return
    setGeneratingStage(stage)
    try {
      const r = await generateReminder(invoice.id, stage)
      setReminders(prev => [r, ...prev])
      toast({ title: 'Email generated', description: `Stage ${stage} draft created` })
    } catch (e: unknown) {
      const errMsg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      if (errMsg?.includes('Free tier')) {
        toast({ title: 'Upgrade Required', description: errMsg, variant: 'destructive' })
      } else {
        toast({ title: 'Error', description: 'Failed to generate email', variant: 'destructive' })
      }
    } finally {
      setGeneratingStage(null)
    }
  }

  const handleSend = async (reminder: ReminderEmail) => {
    setSendingId(reminder.id)
    try {
      if (reminder.status === 'draft') {
        await updateReminder(reminder.id, { subject: reminder.subject, body: reminder.body })
      }
      await sendReminder(reminder.id)
      toast({ title: 'Email sent', description: `Stage ${reminder.stage} sent to ${invoice?.client.email}` })
      load()
    } catch {
      toast({ title: 'Send failed', variant: 'destructive' })
    } finally {
      setSendingId(null)
    }
  }

  const handleResend = async (stage: number) => {
    if (!invoice) return
    setGeneratingStage(stage)
    try {
      const r = await generateReminder(invoice.id, stage)
      setReminders(prev => [r, ...prev])
      toast({ title: 'New draft generated' })
    } catch {
      toast({ title: 'Error', description: 'Failed to regenerate', variant: 'destructive' })
    } finally {
      setGeneratingStage(null)
    }
  }

  const handlePayment = async () => {
    if (!invoice) return
    setPaying(true)
    try {
      const opts = { payment_method: payMethod, payment_date: payDate, notes: payNotes }
      if (payType === 'full') {
        await markPaid(invoice.id, opts)
      } else {
        await markPartial(invoice.id, parseFloat(payAmount), opts)
      }
      toast({ title: payType === 'full' ? 'Marked as paid' : 'Partial payment recorded' })
      setShowPayModal(false)
      load()
    } catch {
      toast({ title: 'Error recording payment', variant: 'destructive' })
    } finally {
      setPaying(false)
    }
  }

  const handleDispute = async () => {
    if (!invoice) return
    try {
      await markDisputed(invoice.id)
      toast({ title: 'Marked as disputed' })
      load()
    } catch {
      toast({ title: 'Error', variant: 'destructive' })
    }
  }

  const handleWriteOff = async () => {
    if (!invoice) return
    try {
      await writeOff(invoice.id)
      toast({ title: 'Invoice written off' })
      load()
    } catch {
      toast({ title: 'Error', variant: 'destructive' })
    }
  }

  if (loading) {
    return <div style={{ padding: '32px', fontFamily: 'var(--font-body)' }}>
      <div style={{ color: 'var(--color-muted)', fontSize: '13px' }}>Loading invoice...</div>
    </div>
  }

  if (!invoice) {
    return <div style={{ padding: '32px', fontFamily: 'var(--font-body)' }}>
      <div style={{ color: 'var(--color-muted)', fontSize: '14px' }}>Invoice not found</div>
    </div>
  }

  const stageMap = new Map<number, ReminderEmail[]>()
  for (const r of reminders) {
    const existing = stageMap.get(r.stage) || []
    existing.push(r)
    stageMap.set(r.stage, existing)
  }

  function getTriggerDate(stageNum: number): string | null {
    if (!rules || !invoice) return null
    const daysKey = `stage_${stageNum}_days` as keyof EscalationRules
    const days = rules[daysKey] as number
    const dueDate = new Date(invoice.due_date)
    const triggerDate = new Date(dueDate)
    triggerDate.setDate(triggerDate.getDate() + days)
    return triggerDate.toISOString()
  }

  const remaining = parseFloat(invoice.amount) - parseFloat(invoice.amount_paid)

  const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
    draft: { label: 'DRAFT', color: '#8A8A8A', bg: 'rgba(138,138,138,0.12)' },
    sent: { label: 'SENT', color: '#1652F0', bg: 'rgba(22,82,240,0.12)' },
    pending: { label: 'PENDING', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    partial: { label: 'PARTIAL', color: '#1652F0', bg: 'rgba(22,82,240,0.12)' },
    recovered: { label: 'PAID', color: '#4A5C47', bg: 'rgba(74,92,71,0.2)' },
    overdue: { label: 'OVERDUE', color: '#FF3B30', bg: 'rgba(255,59,48,0.15)' },
    written_off: { label: 'WRITTEN OFF', color: '#8A8A8A', bg: 'rgba(138,138,138,0.12)' },
    disputed: { label: 'DISPUTED', color: '#F05A00', bg: 'rgba(240,90,0,0.15)' },
  }
  const sc = STATUS_STYLES[invoice.status] || STATUS_STYLES['pending']

  return (
    <div style={{ padding: '32px', fontFamily: 'var(--font-body)', maxWidth: '900px' }}>
      <button onClick={() => navigate('/dashboard')} style={{
        background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer',
        fontSize: '12px', letterSpacing: '0.1em', fontWeight: 600, padding: '0',
        marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-body)',
      }}>
        <span style={{ fontSize: '14px' }}>&larr;</span> BACK TO DASHBOARD
      </button>

      {/* Invoice header */}
      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '6px' }}>INVOICE DETAIL</div>
            <h1 style={{ fontSize: '24px', fontWeight: 900, margin: '0 0 4px', letterSpacing: '-0.02em' }}>#{invoice.invoice_number}</h1>
            <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
              {invoice.client.name}
              {invoice.client.company && <span style={{ color: 'var(--color-muted)' }}> — {invoice.client.company}</span>}
            </div>
            {invoice.description && <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '4px' }}>{invoice.description}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{formatCurrency(invoice.amount, invoice.currency)}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>Due: {formatDate(invoice.due_date)}</div>
            {parseFloat(invoice.amount_paid) > 0 && (
              <div style={{ fontSize: '12px', color: '#4A5C47', marginTop: '2px' }}>
                Paid: {formatCurrency(invoice.amount_paid)} — Remaining: {formatCurrency(remaining)}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '24px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--color-muted)', marginBottom: '4px' }}>STATUS</div>
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', padding: '3px 8px', background: sc.bg, color: sc.color }}>{sc.label}</span>
          </div>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--color-muted)', marginBottom: '4px' }}>DAYS OVERDUE</div>
            <div style={{
              fontSize: '16px', fontWeight: 700, fontFamily: 'monospace',
              color: invoice.days_overdue > 30 ? '#FF3B30' : invoice.days_overdue > 21 ? '#F05A00' : invoice.days_overdue > 7 ? '#F59E0B' : '#4A5C47',
            }}>{invoice.days_overdue > 0 ? `${invoice.days_overdue}d` : 'Current'}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--color-muted)', marginBottom: '4px' }}>EMAILS SENT</div>
            <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: 'monospace' }}>{invoice.reminders_sent}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--color-muted)', marginBottom: '4px' }}>CLIENT EMAIL</div>
            <div style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>{invoice.client.email}</div>
          </div>
          {invoice.source === 'scan' && invoice.scanned_document_id && (
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--color-muted)', marginBottom: '4px' }}>ORIGINAL DOC</div>
              <a href={getDocumentUrl(invoice.scanned_document_id)} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: '11px', color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'underline' }}>VIEW ORIGINAL</a>
            </div>
          )}
        </div>

        {invoice.status !== 'recovered' && invoice.status !== 'written_off' && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
            <button onClick={() => { setPayType('full'); setShowPayModal(true) }} style={{
              padding: '10px 16px', background: '#4A5C47', color: 'white', border: 'none', cursor: 'pointer',
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
            }}>MARK AS PAID</button>
            <button onClick={() => { setPayType('partial'); setPayAmount(''); setShowPayModal(true) }} style={{
              padding: '10px 16px', background: 'transparent', color: '#1652F0',
              border: '1px solid rgba(22,82,240,0.3)', cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
            }}>RECORD PARTIAL</button>
            <button onClick={handleDispute} style={{
              padding: '10px 16px', background: 'transparent', color: '#F05A00',
              border: '1px solid rgba(240,90,0,0.3)', cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
            }}>MARK DISPUTED</button>
            <button onClick={handleWriteOff} style={{
              padding: '10px 16px', background: 'transparent', color: 'var(--color-muted)',
              border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
            }}>WRITE OFF</button>
          </div>
        )}
      </div>

      {/* Line Items */}
      {invoice.line_items && invoice.line_items.length > 0 && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '20px 24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '12px' }}>LINE ITEMS</div>
          <div style={{ border: '1px solid var(--color-border)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 80px 100px 100px',
              padding: '8px 12px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
              color: 'var(--color-muted)', background: '#0A0A0A', borderBottom: '1px solid var(--color-border)',
            }}>
              <span>DESCRIPTION</span><span style={{ textAlign: 'right' }}>QTY</span><span style={{ textAlign: 'right' }}>UNIT PRICE</span><span style={{ textAlign: 'right' }}>TOTAL</span>
            </div>
            {invoice.line_items.map((item, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '2fr 80px 100px 100px',
                padding: '8px 12px', fontSize: '12px', borderBottom: '1px solid var(--color-border)',
              }}>
                <span>{item.description}</span>
                <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{item.quantity}</span>
                <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(item.unit_price)}</span>
                <span style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{formatCurrency(item.total)}</span>
              </div>
            ))}
          </div>
          {(invoice.subtotal || invoice.tax_amount) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '24px', marginTop: '12px', fontSize: '12px' }}>
              {invoice.subtotal && <span>Subtotal: <strong style={{ fontFamily: 'monospace' }}>{formatCurrency(invoice.subtotal)}</strong></span>}
              {invoice.tax_amount && <span>Tax: <strong style={{ fontFamily: 'monospace' }}>{formatCurrency(invoice.tax_amount)}</strong></span>}
            </div>
          )}
        </div>
      )}

      {/* Payment History */}
      {invoice.payments && invoice.payments.length > 0 && (
        <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', padding: '20px 24px', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '12px' }}>PAYMENT HISTORY</div>
          {invoice.payments.map((p, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: i < invoice.payments.length - 1 ? '1px solid var(--color-border)' : 'none',
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{formatCurrency(p.amount)}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                  {formatDate(p.payment_date)} — {PAYMENT_METHODS.find(m => m.value === p.payment_method)?.label || p.payment_method}
                </div>
                {p.notes && <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{p.notes}</div>}
              </div>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#4A5C47', letterSpacing: '0.08em' }}>RECORDED</span>
            </div>
          ))}
        </div>
      )}

      {/* Escalation Timeline */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '16px' }}>ESCALATION TIMELINE</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {[1, 2, 3, 4, 5].map(stageNum => {
          const stageReminders = stageMap.get(stageNum) || []
          const latestReminder = stageReminders[0]
          const hasSent = stageReminders.some(r => r.status === 'sent')
          const hasDraft = stageReminders.some(r => r.status === 'draft')
          const triggerDate = getTriggerDate(stageNum)
          const statusConf = latestReminder ? getReminderStatusConfig(latestReminder.status, false) : getReminderStatusConfig('', true)
          const isExpanded = expandedStage === stageNum

          return (
            <div key={stageNum} style={{
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderLeft: `3px solid ${STAGE_COLORS[stageNum]}`, overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpandedStage(isExpanded ? null : stageNum)}
                style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer', transition: 'background var(--motion-fast)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{
                  width: '32px', height: '32px', background: hasSent ? STAGE_COLORS[stageNum] : `${STAGE_COLORS[stageNum]}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: hasSent ? '#fff' : STAGE_COLORS[stageNum] }}>{stageNum}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-fg)' }}>{STAGE_LABELS[stageNum]}</span>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', padding: '2px 6px', background: statusConf.bg, color: statusConf.color }}>{statusConf.label}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '2px' }}>
                    {latestReminder?.status === 'sent' && latestReminder.sent_at ? `Sent ${formatDateTime(latestReminder.sent_at)}`
                      : latestReminder?.status === 'paused' ? 'Paused — email held'
                      : latestReminder?.status === 'draft' ? 'Draft ready to send'
                      : triggerDate ? `Triggers at ${rules ? (rules[`stage_${stageNum}_days` as keyof EscalationRules] as number) : '?'}d overdue — ${formatDate(triggerDate)}` : ''}
                  </div>
                </div>
                <span style={{ color: 'var(--color-muted)', fontSize: '12px', flexShrink: 0 }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
              </div>

              {isExpanded && (
                <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '12px', marginBottom: '6px' }}>{STAGE_DESCRIPTIONS[stageNum]}</div>

                  {stageReminders.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
                      {stageReminders.map(r => (
                        <div key={r.id} style={{ background: '#0F0F0F', border: '1px solid var(--color-border)', padding: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div>
                              <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '4px' }}>SUBJECT</div>
                              <div style={{ fontSize: '14px', fontWeight: 600 }}>{r.subject}</div>
                            </div>
                            <span style={{
                              fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', padding: '2px 6px', flexShrink: 0,
                              background: getReminderStatusConfig(r.status, false).bg, color: getReminderStatusConfig(r.status, false).color,
                            }}>{getReminderStatusConfig(r.status, false).label}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                              <span>To: <span style={{ fontFamily: 'monospace' }}>{r.recipient_email || invoice.client.email}</span></span>
                              {r.sent_at && <span>Sent: {formatDateTime(r.sent_at)}</span>}
                              {r.status === 'failed' && <span style={{ color: '#FF3B30' }}>Delivery failed</span>}
                            </div>
                            {r.email_message_id && <div style={{ fontFamily: 'monospace', fontSize: '10px' }}>Message-ID: {r.email_message_id}</div>}
                          </div>
                          <div style={{
                            fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace', padding: '12px', background: 'rgba(255,255,255,0.02)',
                            border: '1px solid var(--color-border)', maxHeight: '300px', overflowY: 'auto',
                          }}>{r.body}</div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            {r.status === 'draft' && (
                              <button onClick={e => { e.stopPropagation(); handleSend(r) }} disabled={sendingId === r.id} style={{
                                padding: '8px 16px', background: sendingId === r.id ? 'var(--color-border)' : 'var(--color-accent)',
                                color: 'white', border: 'none', cursor: sendingId === r.id ? 'not-allowed' : 'pointer',
                                fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
                              }}>{sendingId === r.id ? 'SENDING...' : 'SEND NOW'}</button>
                            )}
                            {r.status === 'sent' && (
                              <button onClick={e => { e.stopPropagation(); handleResend(stageNum) }} disabled={generatingStage === stageNum} style={{
                                padding: '8px 16px', background: 'transparent', color: 'var(--color-muted)',
                                border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
                              }}>{generatingStage === stageNum ? 'GENERATING...' : 'RESEND'}</button>
                            )}
                            {(r.status === 'failed' || r.status === 'paused') && (
                              <button onClick={e => { e.stopPropagation(); handleSend(r) }} disabled={sendingId === r.id} style={{
                                padding: '8px 16px', background: sendingId === r.id ? 'var(--color-border)' : '#FF3B30',
                                color: 'white', border: 'none', cursor: sendingId === r.id ? 'not-allowed' : 'pointer',
                                fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
                              }}>{sendingId === r.id ? 'RETRYING...' : 'RETRY SEND'}</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ padding: '20px', background: '#0F0F0F', border: '1px dashed var(--color-border)', textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '12px' }}>
                          {triggerDate && `Scheduled to trigger ${formatDate(triggerDate)}`}
                        </div>
                        <button onClick={e => { e.stopPropagation(); handleGenerate(stageNum) }} disabled={generatingStage === stageNum} style={{
                          padding: '10px 20px', background: generatingStage === stageNum ? 'var(--color-border)' : 'var(--color-accent)',
                          color: 'white', border: 'none', cursor: generatingStage === stageNum ? 'not-allowed' : 'pointer',
                          fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
                        }}>{generatingStage === stageNum ? 'GENERATING...' : `GENERATE STAGE ${stageNum} EMAIL`}</button>
                      </div>
                    </div>
                  )}

                  {stageReminders.length > 0 && !hasDraft && (
                    <div style={{ marginTop: '8px' }}>
                      <button onClick={e => { e.stopPropagation(); handleGenerate(stageNum) }} disabled={generatingStage === stageNum} style={{
                        padding: '6px 14px', background: 'transparent', color: 'var(--color-muted)',
                        border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em',
                      }}>{generatingStage === stageNum ? 'GENERATING...' : 'GENERATE NEW DRAFT'}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Payment Modal */}
      {showPayModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }} onClick={e => e.target === e.currentTarget && setShowPayModal(false)}>
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', width: '100%', maxWidth: '420px' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--color-muted)' }}>RECORD PAYMENT</div>
              <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>{payType === 'full' ? 'Full Payment' : 'Partial Payment'}</div>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {payType === 'partial' && (
                <div>
                  <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '4px' }}>AMOUNT (remaining: {formatCurrency(remaining)})</div>
                  <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" step="0.01" style={inputStyle} />
                </div>
              )}
              <div>
                <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '4px' }}>PAYMENT DATE</div>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '6px' }}>PAYMENT METHOD</div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.value} onClick={() => setPayMethod(m.value)} style={{
                      padding: '6px 10px', fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em',
                      border: `1px solid ${payMethod === m.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                      background: payMethod === m.value ? 'rgba(240,90,0,0.1)' : 'transparent',
                      color: payMethod === m.value ? 'var(--color-accent)' : 'var(--color-muted)', cursor: 'pointer',
                    }}>{m.label.toUpperCase()}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '4px' }}>NOTES (OPTIONAL)</div>
                <input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="e.g. Bank ref #12345" style={inputStyle} />
              </div>
              <button onClick={handlePayment} disabled={paying || (payType === 'partial' && !payAmount)} style={{
                width: '100%', padding: '12px', background: '#4A5C47', color: 'white', border: 'none',
                cursor: 'pointer', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', marginTop: '4px',
              }}>{paying ? 'RECORDING...' : 'CONFIRM PAYMENT'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: '#0F0F0F',
  border: '1px solid var(--color-border)', color: 'var(--color-fg)',
  fontSize: '13px', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
}
