import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, LoginButton } from '@govector/auth'

// ─────────────────────────────────────────────────────────────
// GLOBAL STYLES
// ─────────────────────────────────────────────────────────────

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,900&display=swap');

.lp-btn-primary {
  display: inline-flex; align-items: center; justify-content: center;
  background: #F05A00; color: #fff; border: none;
  font-family: 'DM Sans', system-ui, sans-serif;
  font-size: 13px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; height: 52px; width: 280px;
  border-radius: 0; cursor: pointer; transition: background 80ms;
}
.lp-btn-primary:hover { background: #C44A00; }

.lp-btn-secondary {
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: #F0EFEA;
  border: 1px solid rgba(240,239,234,0.32);
  font-family: 'DM Sans', system-ui, sans-serif;
  font-size: 13px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; height: 52px; width: 280px;
  border-radius: 0; cursor: pointer; transition: background 80ms;
}
.lp-btn-secondary:hover { background: rgba(240,239,234,0.06); }

@media (max-width: 768px) {
  .lp-btn-primary, .lp-btn-secondary { width: 100%; }
  .lp-hero-grid { grid-template-columns: 1fr !important; }
  .lp-bento-grid { grid-template-columns: 1fr !important; grid-template-areas: none !important; }
  .lp-bento-sync { grid-area: auto !important; }
  .lp-bento-email { grid-area: auto !important; }
  .lp-bento-rules { grid-area: auto !important; }
  .lp-bento-stats { grid-area: auto !important; }
  .lp-hero-pad { padding: 100px 24px 80px !important; }
  .lp-section-pad { padding: 72px 24px !important; }
  .lp-stat-pad { padding: 64px 24px !important; }
  .lp-hero-headline { font-size: 52px !important; line-height: 1.0 !important; }
  .lp-nav-links { display: none !important; }
  .lp-nav { padding: 0 24px !important; }
  .lp-dash-scroll { overflow-x: auto; }
}
`

// ─────────────────────────────────────────────────────────────
// TYPES & DATA
// ─────────────────────────────────────────────────────────────

type InvoiceStatus = 'Pending' | 'Partially Paid' | 'Recovered'

interface Invoice {
  id: string
  client: string
  amount: string
  daysOverdue: number
  stage: number
  status: InvoiceStatus
}

const DASHBOARD_INVOICES: Invoice[] = [
  { id: '#1042', client: 'Meridian Consulting', amount: '$4,800.00', daysOverdue: 7, stage: 1, status: 'Pending' },
  { id: '#1039', client: 'Atlas Digital Group', amount: '$12,500.00', daysOverdue: 21, stage: 3, status: 'Partially Paid' },
  { id: '#1035', client: 'Forge Creative Co.', amount: '$2,200.00', daysOverdue: 5, stage: 1, status: 'Pending' },
  { id: '#1028', client: 'Vertex Labs', amount: '$8,750.00', daysOverdue: 45, stage: 5, status: 'Recovered' },
  { id: '#1021', client: 'Northgate Media', amount: '$3,150.00', daysOverdue: 14, stage: 2, status: 'Pending' },
  { id: '#1018', client: 'Summit Analytics', amount: '$6,400.00', daysOverdue: 28, stage: 4, status: 'Partially Paid' },
  { id: '#1011', client: 'Prism Agency', amount: '$9,800.00', daysOverdue: 63, stage: 5, status: 'Recovered' },
]

const CHART_DATA = [
  { month: 'SEP', amount: 8200 },
  { month: 'OCT', amount: 12400 },
  { month: 'NOV', amount: 9800 },
  { month: 'DEC', amount: 15600 },
  { month: 'JAN', amount: 11200 },
  { month: 'FEB', amount: 18750 },
  { month: 'MAR', amount: 14300 },
  { month: 'APR', amount: 21500 },
]

const TYPEWRITER_TEXTS = [
  'Friendly reminder: Invoice #1042 is due',
  'Second notice: Payment overdue by 14 days',
  'Final warning before legal action',
]

const EMAIL_STAGES = [
  { stage: 1, label: 'Friendly Reminder', color: '#1652F0', subject: 'Invoice #1042 — Payment reminder' },
  { stage: 2, label: 'Past Due Notice', color: '#FF8430', subject: 'Invoice #1042 — Now 7 days overdue' },
  { stage: 3, label: 'Firm Collection Notice', color: '#FF6B1A', subject: 'Invoice #1042 — Urgent: 14 days past due' },
  { stage: 4, label: 'Pre-Legal Warning', color: '#F05A00', subject: 'Invoice #1042 — Final notice, 30 days overdue' },
  { stage: 5, label: 'Legal Demand Letter', color: '#D04800', subject: 'Invoice #1042 — Legal action initiated' },
]

// ─────────────────────────────────────────────────────────────
// HOOKS
// ─────────────────────────────────────────────────────────────

function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

function useTypewriter(texts: string[]) {
  const [textIdx, setTextIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [erasing, setErasing] = useState(false)
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    const current = texts[textIdx]
    let tid: ReturnType<typeof setTimeout>
    if (!erasing) {
      if (charIdx < current.length) {
        tid = setTimeout(() => setCharIdx(c => c + 1), 52)
      } else {
        tid = setTimeout(() => {
          setOpacity(0)
          const t2 = setTimeout(() => { setOpacity(1); setErasing(true) }, 200)
          return () => clearTimeout(t2)
        }, 2200)
      }
    } else {
      if (charIdx > 0) {
        tid = setTimeout(() => setCharIdx(c => c - 1), 26)
      } else {
        setErasing(false)
        setTextIdx(i => (i + 1) % texts.length)
      }
    }
    return () => clearTimeout(tid)
  }, [charIdx, erasing, textIdx, texts])

  return { text: texts[textIdx].slice(0, charIdx), opacity }
}

// ─────────────────────────────────────────────────────────────
// PRIMITIVE COMPONENTS
// ─────────────────────────────────────────────────────────────

function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.15em',
      textTransform: 'uppercase' as const,
      color: light ? 'rgba(17,17,17,0.45)' : 'rgba(240,239,234,0.4)',
      marginBottom: 12,
    }}>
      {children}
    </div>
  )
}

function StageDots({ filled, total = 5 }: { filled: number; total?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: i < filled ? '#F05A00' : 'transparent',
          border: `1px solid ${i < filled ? '#F05A00' : '#3A3A3A'}`,
          display: 'inline-block',
          flexShrink: 0,
        }} />
      ))}
    </span>
  )
}

function StatusChip({ status }: { status: InvoiceStatus }) {
  const cfg: Record<InvoiceStatus, { bg: string; color: string; border: string }> = {
    Pending: { bg: 'rgba(255,255,255,0.04)', color: 'rgba(240,239,234,0.38)', border: '#2E2E2E' },
    'Partially Paid': { bg: 'rgba(74,92,71,0.22)', color: '#7AAA75', border: '#4A5C47' },
    Recovered: { bg: 'rgba(74,92,71,0.42)', color: '#9DC998', border: '#5A7A55' },
  }
  const c = cfg[status]
  return (
    <span style={{
      background: c.bg,
      color: c.color,
      border: `1px solid ${c.border}`,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.09em',
      textTransform: 'uppercase' as const,
      padding: '3px 7px',
      borderRadius: 2,
      whiteSpace: 'nowrap' as const,
    }}>
      {status}
    </span>
  )
}

function overdueColor(days: number) {
  if (days <= 7) return '#5A92F2'
  if (days <= 14) return '#3A78F0'
  if (days <= 30) return '#1652F0'
  return '#0A3CCC'
}

function RevealItem({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const { ref, visible } = useReveal()
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(24px)',
      transition: `opacity 400ms ease-out ${delay}ms, transform 400ms ease-out ${delay}ms`,
      ...style,
    }}>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// NAV
// ─────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <nav className="lp-nav" style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      zIndex: 100,
      background: 'rgba(17,17,17,0.94)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid #1A1A1A',
      padding: '0 80px',
      height: 58,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect width="9" height="9" fill="#F05A00" />
          <rect x="13" width="9" height="9" fill="#F05A00" fillOpacity="0.38" />
          <rect y="13" width="9" height="9" fill="#F05A00" fillOpacity="0.38" />
          <rect x="13" y="13" width="9" height="9" fill="#F05A00" fillOpacity="0.14" />
        </svg>
        <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.025em', color: '#F0EFEA' }}>
          INVO
        </span>
      </div>

      <div className="lp-nav-links" style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
        {[
          ['Features', '#features'],
          ['Dashboard', '#dashboard'],
          ['Pricing', '/pricing'],
          ['How It Works', '#how-it-works'],
        ].map(([label, href]) => (
          <a key={href} href={href} style={{
            color: 'rgba(240,239,234,0.48)',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.01em',
            transition: 'color 120ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#F0EFEA' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(240,239,234,0.48)' }}
          >
            {label}
          </a>
        ))}
        <a href="#get-started" style={{
          background: '#F05A00',
          color: '#fff',
          textDecoration: 'none',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          padding: '0 18px',
          height: 34,
          display: 'inline-flex',
          alignItems: 'center',
          transition: 'background 80ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#C44A00' }}
        onMouseLeave={e => { e.currentTarget.style.background = '#F05A00' }}
        >
          Get Started
        </a>
      </div>
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────
// HERO SECTION
// ─────────────────────────────────────────────────────────────

function HeroSection() {
  const { text: twText, opacity: twOpacity } = useTypewriter(TYPEWRITER_TEXTS)

  const heroInvoices = [
    { id: '#1042', client: 'Meridian Consulting', amount: '$4,800', stage: 1 },
    { id: '#1039', client: 'Atlas Digital', amount: '$12,500', stage: 3 },
    { id: '#1028', client: 'Vertex Labs', amount: '$8,750', stage: 5 },
  ]

  return (
    <section id="hero" className="lp-hero-pad" style={{
      padding: '140px 80px 100px',
      maxWidth: 1440,
      margin: '0 auto',
    }}>
      <div className="lp-hero-grid" style={{
        display: 'grid',
        gridTemplateColumns: '3fr 2fr',
        gap: 72,
        alignItems: 'center',
      }}>
        {/* Left: Headline + CTA */}
        <div>
          <Eyebrow>Invoice Recovery Platform</Eyebrow>
          <h1 className="lp-hero-headline" style={{
            fontSize: 96,
            fontWeight: 900,
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            color: '#F0EFEA',
            margin: '0 0 32px',
          }}>
            Stop
            {' '}
            <span style={{ color: '#F05A00' }}>chasing</span>
            {' '}
            invoices.
          </h1>
          <p style={{
            fontSize: 18,
            lineHeight: 1.6,
            color: 'rgba(240,239,234,0.62)',
            maxWidth: 480,
            marginBottom: 48,
            fontWeight: 400,
          }}>
            Automated invoice follow-up that escalates through 5 stages —
            from friendly reminder to legal demand — without lifting a finger.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
            <LoginButton label="Start recovering" />
            <button className="lp-btn-secondary">See how it works</button>
          </div>
          <div style={{
            marginTop: 40,
            display: 'flex',
            gap: 40,
          }}>
            {[
              ['$47.2M', 'Recovered to date'],
              ['54%', 'Faster than manual'],
              ['5-stage', 'Escalation system'],
            ].map(([val, label]) => (
              <div key={label}>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#F0EFEA', letterSpacing: '-0.02em' }}>{val}</div>
                <div style={{ fontSize: 11, color: 'rgba(240,239,234,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Hero widget */}
        <div style={{
          background: '#1C1C1C',
          border: '1px solid #2A2A2A',
          borderRadius: 4,
          overflow: 'hidden',
        }}>
          {/* Orange bar */}
          <div style={{ height: 4, background: '#F05A00', width: '100%' }} />

          {/* Widget header */}
          <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #222' }}>
            <Eyebrow>Invoice Recovery Summary</Eyebrow>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div>
                <span style={{ fontSize: 34, fontWeight: 900, color: '#F0EFEA', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>$31</span>
                <span style={{ fontSize: 17, fontWeight: 700, color: 'rgba(240,239,234,0.45)', letterSpacing: '-0.01em' }}>,400</span>
                <span style={{ fontSize: 11, color: 'rgba(240,239,234,0.3)', marginLeft: 8, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>overdue</span>
              </div>
              <div style={{
                background: 'rgba(22,82,240,0.15)',
                border: '1px solid #1652F0',
                color: '#5A8FF8',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase' as const,
                padding: '3px 8px',
                borderRadius: 2,
              }}>
                9 active
              </div>
            </div>
          </div>

          {/* Invoice rows */}
          <div style={{ padding: '8px 0' }}>
            {heroInvoices.map((inv, i) => (
              <div key={inv.id} style={{
                padding: '10px 20px',
                borderBottom: i < heroInvoices.length - 1 ? '1px solid #1E1E1E' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#F0EFEA', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.client}</div>
                  <div style={{ fontSize: 11, color: 'rgba(240,239,234,0.35)', marginTop: 2 }}>{inv.id}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#F0EFEA', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{inv.amount}</div>
                <StageDots filled={inv.stage} />
              </div>
            ))}
          </div>

          {/* Typewriter */}
          <div style={{
            padding: '14px 20px',
            borderTop: '1px solid #1E1E1E',
            background: '#161616',
          }}>
            <Eyebrow>Next email</Eyebrow>
            <div style={{
              fontSize: 12,
              color: '#F05A00',
              fontWeight: 500,
              opacity: twOpacity,
              transition: 'opacity 200ms',
              minHeight: 18,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {twText}
              <span style={{
                display: 'inline-block',
                width: 2,
                height: 12,
                background: '#F05A00',
                marginLeft: 2,
                animation: 'none',
                verticalAlign: 'middle',
              }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// STAT BAND
// ─────────────────────────────────────────────────────────────

function StatBand() {
  return (
    <section className="lp-stat-pad" style={{
      background: '#F05A00',
      padding: '80px 80px',
    }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        <Eyebrow light>Platform benchmark</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
          <span style={{
            fontSize: 120,
            fontWeight: 900,
            lineHeight: 0.9,
            letterSpacing: '-0.04em',
            color: '#111111',
          }}>
            54
          </span>
          <span style={{
            fontSize: 64,
            fontWeight: 900,
            letterSpacing: '-0.03em',
            color: '#111111',
          }}>
            %
          </span>
        </div>
        <div style={{
          fontSize: 26,
          fontWeight: 700,
          color: 'rgba(17,17,17,0.72)',
          marginTop: 12,
          letterSpacing: '-0.01em',
        }}>
          Freelancers recover invoices 54% faster.
        </div>
        <div style={{
          fontSize: 15,
          color: 'rgba(17,17,17,0.5)',
          marginTop: 12,
          maxWidth: 480,
          lineHeight: 1.5,
        }}>
          Compared to manual follow-up via email.
          Across 12,000+ invoices tracked through our escalation system.
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// FEATURES — BENTO GRID
// ─────────────────────────────────────────────────────────────

function FeatureCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#1C1C1C',
      border: '1px solid #2A2A2A',
      borderRadius: 4,
      padding: 28,
      ...style,
    }}>
      {children}
    </div>
  )
}

function FeaturesSection() {
  return (
    <section id="features" className="lp-section-pad" style={{ background: '#111111', padding: '100px 80px' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        <RevealItem delay={0}>
          <Eyebrow>Platform Features</Eyebrow>
          <h2 style={{
            fontSize: 48,
            fontWeight: 900,
            letterSpacing: '-0.025em',
            color: '#F0EFEA',
            marginBottom: 48,
            lineHeight: 1.05,
          }}>
            Built for freelancers who<br />bill like businesses.
          </h2>
        </RevealItem>

        <div className="lp-bento-grid" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gridTemplateAreas: `
            "sync email email"
            "sync rules stats"
          `,
          gap: 12,
        }}>
          {/* Invoice Sync — tall */}
          <RevealItem delay={80} style={{ gridArea: 'sync' } as React.CSSProperties}>
            <FeatureCard style={{ height: '100%', display: 'flex', flexDirection: 'column' as const }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(22,82,240,0.12)',
                border: '1px solid rgba(22,82,240,0.4)',
                color: '#5A8FF8',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase' as const,
                padding: '4px 10px',
                borderRadius: 2,
                marginBottom: 20,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1652F0', display: 'inline-block' }} />
                Connected
              </div>
              <Eyebrow>Invoice Sync</Eyebrow>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#F0EFEA', letterSpacing: '-0.02em', marginBottom: 8 }}>
                Automatic invoice monitoring
              </div>
              <p style={{ fontSize: 14, color: 'rgba(240,239,234,0.48)', lineHeight: 1.6, marginBottom: 28 }}>
                Connect your invoicing tool once. INVO watches for overdue payments and triggers escalations automatically.
              </p>

              {/* Integrations */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, color: 'rgba(240,239,234,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 10 }}>Integrations</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['QuickBooks', 'FreshBooks', 'Wave', 'HoneyBook'].map(tool => (
                    <div key={tool} style={{
                      background: '#262626',
                      border: '1px solid #333',
                      color: 'rgba(240,239,234,0.55)',
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '5px 8px',
                      letterSpacing: '0.05em',
                    }}>
                      {tool}
                    </div>
                  ))}
                </div>
              </div>

              {/* Circular progress */}
              <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 'auto' }}>
                <svg width="72" height="72" viewBox="0 0 72 72" style={{ flexShrink: 0 }}>
                  <circle cx="36" cy="36" r="28" fill="none" stroke="#2A2A2A" strokeWidth="5" />
                  <circle
                    cx="36" cy="36" r="28" fill="none"
                    stroke="#1652F0" strokeWidth="5"
                    strokeDasharray={`${2 * Math.PI * 28 * 0.87} ${2 * Math.PI * 28 * 0.13}`}
                    strokeDashoffset={2 * Math.PI * 28 * 0.25}
                    strokeLinecap="square"
                    transform="rotate(-90 36 36)"
                  />
                  <text x="36" y="40" textAnchor="middle" fill="#F0EFEA" fontSize="13" fontWeight="700" fontFamily="DM Sans, sans-serif">87%</text>
                </svg>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#F0EFEA', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>23</div>
                  <div style={{ fontSize: 11, color: 'rgba(240,239,234,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Invoices monitored</div>
                  <div style={{ fontSize: 11, color: 'rgba(240,239,234,0.25)', marginTop: 4 }}>Last sync: 4 min ago</div>
                </div>
              </div>
            </FeatureCard>
          </RevealItem>

          {/* AI Email Sequence — wide */}
          <RevealItem delay={160} style={{ gridArea: 'email' } as React.CSSProperties}>
            <FeatureCard>
              <Eyebrow>AI Email Sequences</Eyebrow>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 32 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#F0EFEA', letterSpacing: '-0.02em', marginBottom: 8 }}>
                    5-stage escalation, written by AI
                  </div>
                  <p style={{ fontSize: 14, color: 'rgba(240,239,234,0.48)', lineHeight: 1.6, maxWidth: 260 }}>
                    Each stage auto-calibrates tone — from polite reminder to firm legal demand.
                  </p>
                </div>

                {/* Stacked email cards */}
                <div style={{ position: 'relative', width: 220, height: 160, flexShrink: 0 }}>
                  {EMAIL_STAGES.slice().reverse().map((s, ri) => {
                    const i = EMAIL_STAGES.length - 1 - ri
                    const offsets = [
                      { x: -18, y: -28, rot: -3.5 },
                      { x: -10, y: -18, rot: -2 },
                      { x: -4, y: -9, rot: -0.8 },
                      { x: 2, y: -3, rot: 0.3 },
                      { x: 0, y: 0, rot: 0 },
                    ]
                    const off = offsets[i]
                    return (
                      <div key={s.stage} style={{
                        position: 'absolute',
                        bottom: 0, left: 0, right: 0,
                        background: '#262626',
                        border: `1px solid ${s.color}40`,
                        borderLeft: `3px solid ${s.color}`,
                        borderRadius: 2,
                        padding: '10px 12px',
                        transform: `translate(${off.x}px, ${off.y}px) rotate(${off.rot}deg)`,
                        zIndex: i + 1,
                      }}>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: s.color, marginBottom: 4 }}>
                          Stage {s.stage} — {s.label}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(240,239,234,0.55)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.subject}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </FeatureCard>
          </RevealItem>

          {/* Escalation Rules */}
          <RevealItem delay={240} style={{ gridArea: 'rules' } as React.CSSProperties}>
            <FeatureCard>
              <Eyebrow>Escalation Rules</Eyebrow>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#F0EFEA', letterSpacing: '-0.02em', marginBottom: 20 }}>
                Day-trigger thresholds
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                {[
                  { label: 'Day 1', pct: 8, stage: 1 },
                  { label: 'Day 7', pct: 26, stage: 2 },
                  { label: 'Day 14', pct: 46, stage: 3 },
                  { label: 'Day 30', pct: 72, stage: 4 },
                  { label: 'Day 60+', pct: 100, stage: 5 },
                ].map(({ label, pct, stage }) => (
                  <div key={label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(240,239,234,0.55)', letterSpacing: '0.08em' }}>{label}</span>
                      <span style={{ fontSize: 10, color: 'rgba(240,239,234,0.3)', letterSpacing: '0.1em' }}>STAGE {stage}</span>
                    </div>
                    <div style={{ height: 4, background: '#262626', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: stage <= 2 ? '#F05A00' : stage <= 4 ? '#D94800' : '#C44000',
                        borderRadius: 99,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </FeatureCard>
          </RevealItem>

          {/* Recovery Stats */}
          <RevealItem delay={320} style={{ gridArea: 'stats' } as React.CSSProperties}>
            <FeatureCard style={{ display: 'flex', flexDirection: 'column' as const }}>
              <div style={{ display: 'flex', gap: 0, flex: 1 }}>
                <div style={{ width: 4, background: '#F05A00', flexShrink: 0, marginRight: 20, alignSelf: 'stretch' }} />
                <div>
                  <Eyebrow>Recovery Stats</Eyebrow>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 46, fontWeight: 900, color: '#F0EFEA', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>$18</span>
                    <span style={{ fontSize: 24, fontWeight: 900, color: 'rgba(240,239,234,0.5)', letterSpacing: '-0.02em' }}>,750</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(240,239,234,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 16 }}>
                    Recovered this month
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(74,92,71,0.22)', border: '1px solid #4A5C47',
                    color: '#7AAA75', fontSize: 12, fontWeight: 700,
                    padding: '4px 10px', borderRadius: 2,
                  }}>
                    ▲ 23% vs last month
                  </div>
                </div>
              </div>
            </FeatureCard>
          </RevealItem>
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD MOCK
// ─────────────────────────────────────────────────────────────

function DashboardSection() {
  return (
    <section id="dashboard" className="lp-section-pad" style={{ background: '#0E0E0E', padding: '100px 80px' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        <RevealItem delay={0}>
          <Eyebrow>Live Dashboard</Eyebrow>
          <h2 style={{
            fontSize: 44,
            fontWeight: 900,
            letterSpacing: '-0.025em',
            color: '#F0EFEA',
            marginBottom: 40,
            lineHeight: 1.05,
          }}>
            Full visibility. Zero follow-up.
          </h2>
        </RevealItem>

        <RevealItem delay={80}>
          <div style={{
            background: '#1C1C1C',
            border: '1px solid #272727',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            {/* Top bar */}
            <div style={{
              background: '#161616',
              borderBottom: '1px solid #242424',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: '#2A2A2A' }} />
              ))}
              <div style={{
                marginLeft: 12,
                fontSize: 11,
                color: 'rgba(240,239,234,0.25)',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}>
                INVO — Invoice Recovery Dashboard
              </div>
            </div>

            {/* Stat tiles */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              borderBottom: '1px solid #242424',
            }}>
              {[
                { label: 'Total Overdue', value: '$31,400', sub: '9 invoices', accent: null },
                { label: 'Invoices Flagged', value: '9', sub: 'Active escalations', accent: '#1652F0' },
                { label: 'Recovered This Month', value: '$18,750', sub: '▲ 23% vs prior month', accent: '#F05A00' },
              ].map(({ label, value, sub, accent }, i) => (
                <div key={label} style={{
                  padding: '24px 24px',
                  borderRight: i < 2 ? '1px solid #242424' : 'none',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {accent && (
                    <div style={{
                      position: 'absolute',
                      top: 0, left: 0, right: 0,
                      height: 3,
                      background: accent,
                    }} />
                  )}
                  <div style={{ fontSize: 11, color: 'rgba(240,239,234,0.35)', letterSpacing: '0.12em', textTransform: 'uppercase' as const, marginBottom: 8 }}>{label}</div>
                  <div style={{ fontSize: 32, fontWeight: 900, color: '#F0EFEA', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{value}</div>
                  <div style={{ fontSize: 12, color: accent ? (accent === '#1652F0' ? '#5A8FF8' : '#F05A00') : 'rgba(240,239,234,0.38)' }}>{sub}</div>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="lp-dash-scroll">
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #242424' }}>
                    {['Invoice', 'Client', 'Amount', 'Days Overdue', 'Stage', 'Status'].map(h => (
                      <th key={h} style={{
                        padding: '10px 20px',
                        textAlign: 'left',
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'rgba(240,239,234,0.28)',
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        fontFamily: 'inherit',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DASHBOARD_INVOICES.map((inv, i) => (
                    <tr key={inv.id} style={{
                      borderBottom: i < DASHBOARD_INVOICES.length - 1 ? '1px solid #1E1E1E' : 'none',
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                    }}>
                      <td style={{ padding: '14px 20px', fontSize: 12, fontWeight: 600, color: 'rgba(240,239,234,0.45)', fontFamily: 'inherit' }}>{inv.id}</td>
                      <td style={{ padding: '14px 20px', fontSize: 13, fontWeight: 500, color: '#F0EFEA', fontFamily: 'inherit' }}>{inv.client}</td>
                      <td style={{ padding: '14px 20px', fontSize: 13, fontWeight: 700, color: '#F0EFEA', fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Sans', monospace" }}>{inv.amount}</td>
                      <td style={{ padding: '14px 20px', fontFamily: 'inherit' }}>
                        <span style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: overdueColor(inv.daysOverdue),
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {inv.daysOverdue}d
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px', fontFamily: 'inherit' }}>
                        <StageDots filled={inv.stage} />
                      </td>
                      <td style={{ padding: '14px 20px', fontFamily: 'inherit' }}>
                        <StatusChip status={inv.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </RevealItem>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// RECOVERY CHART (LOLLIPOP)
// ─────────────────────────────────────────────────────────────

function RecoveryChartSection() {
  const { ref, visible } = useReveal(0.1)
  const maxAmount = Math.max(...CHART_DATA.map(d => d.amount))
  const chartH = 160

  return (
    <section id="how-it-works" className="lp-section-pad" style={{ background: '#F0EFEA', padding: '100px 80px' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        <RevealItem delay={0}>
          <Eyebrow light>Recovery Trend</Eyebrow>
          <h2 style={{
            fontSize: 44,
            fontWeight: 900,
            letterSpacing: '-0.025em',
            color: '#111111',
            marginBottom: 16,
            lineHeight: 1.05,
          }}>
            Invoices recovered over time.
          </h2>
          <p style={{
            fontSize: 16,
            color: 'rgba(17,17,17,0.55)',
            maxWidth: 480,
            lineHeight: 1.6,
            marginBottom: 56,
          }}>
            Each bar represents total recovered in that month. The system gets more effective as it learns your clients.
          </p>
        </RevealItem>

        <div ref={ref} style={{ display: 'flex', alignItems: 'flex-end', gap: 20, height: chartH + 48 }}>
          {CHART_DATA.map((d, i) => {
            const stemH = Math.round((d.amount / maxAmount) * chartH)
            const delay = i * 65

            return (
              <div key={d.month} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                flex: 1, justifyContent: 'flex-end',
              }}>
                {/* Amount label */}
                <div style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'rgba(17,17,17,0.45)',
                  marginBottom: 6,
                  letterSpacing: '0.05em',
                  opacity: visible ? 1 : 0,
                  transition: `opacity 300ms ease-out ${delay + 800}ms`,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  ${(d.amount / 1000).toFixed(1)}k
                </div>
                {/* Dot */}
                <div style={{
                  width: 12, height: 12,
                  borderRadius: '50%',
                  background: '#F05A00',
                  flexShrink: 0,
                  transform: visible ? 'scale(1)' : 'scale(0)',
                  transition: `transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1) ${delay + 560}ms`,
                }} />
                {/* Stem */}
                <div style={{
                  width: 3,
                  height: stemH,
                  background: '#C8C4BA',
                  flexShrink: 0,
                  transformOrigin: 'bottom',
                  transform: visible ? 'scaleY(1)' : 'scaleY(0)',
                  transition: `transform 560ms ease-out ${delay}ms`,
                }} />
                {/* Month label */}
                <div style={{
                  fontSize: 10,
                  color: 'rgba(17,17,17,0.4)',
                  marginTop: 8,
                  letterSpacing: '0.1em',
                  fontWeight: 700,
                }}>
                  {d.month}
                </div>
              </div>
            )
          })}
        </div>

        {/* Summary stat */}
        <RevealItem delay={200} style={{ marginTop: 56 }}>
          <div style={{ display: 'flex', gap: 48 }}>
            {[
              { val: '$110,450', label: 'Total recovered (8 months)' },
              { val: '71%', label: 'Recovery rate on flagged invoices' },
              { val: '12.4 days', label: 'Average time to recover' },
            ].map(({ val, label }) => (
              <div key={label} style={{ borderLeft: '3px solid #F05A00', paddingLeft: 16 }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#111111', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                <div style={{ fontSize: 12, color: 'rgba(17,17,17,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        </RevealItem>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// CTA SECTION
// ─────────────────────────────────────────────────────────────

function CTASection() {
  return (
    <section id="get-started" className="lp-section-pad" style={{ background: '#111111', padding: '120px 80px' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        <RevealItem delay={0}>
          <Eyebrow>Get Started</Eyebrow>
          <h2 style={{
            fontSize: 72,
            fontWeight: 900,
            letterSpacing: '-0.03em',
            color: '#F0EFEA',
            lineHeight: 0.95,
            marginBottom: 24,
            maxWidth: 680,
          }}>
            Your next invoice
            {' '}
            <span style={{ color: '#F05A00' }}>won't go unpaid.</span>
          </h2>
          <p style={{
            fontSize: 16,
            color: 'rgba(240,239,234,0.5)',
            lineHeight: 1.7,
            maxWidth: 440,
            marginBottom: 48,
          }}>
            Connect your invoicing tool, set your escalation rules, and let INVO
            handle every follow-up — from polite reminder to legal demand.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
            <LoginButton label="Start for free" />
            <button className="lp-btn-secondary">Watch a demo</button>
          </div>
        </RevealItem>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer style={{
      background: '#0A0A0A',
      borderTop: '1px solid #1A1A1A',
      padding: '24px 80px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
          <rect width="9" height="9" fill="#F05A00" />
          <rect x="13" width="9" height="9" fill="#F05A00" fillOpacity="0.38" />
          <rect y="13" width="9" height="9" fill="#F05A00" fillOpacity="0.38" />
          <rect x="13" y="13" width="9" height="9" fill="#F05A00" fillOpacity="0.14" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(240,239,234,0.5)', letterSpacing: '0.02em' }}>
          INVO
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'rgba(240,239,234,0.22)', letterSpacing: '0.04em' }}>
        © {new Date().getFullYear()} INVO. All rights reserved.
      </div>
    </footer>
  )
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────

export function LandingPage() {
  const { isAuthenticated, loading } = useAuth()

  if (!loading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div style={{
      fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
      background: '#111111',
      color: '#F0EFEA',
      minHeight: '100vh',
      overflowX: 'hidden',
    }}>
      <style>{GLOBAL_CSS}</style>
      <NavBar />
      <HeroSection />
      <StatBand />
      <FeaturesSection />
      <DashboardSection />
      <RecoveryChartSection />
      <CTASection />
      <Footer />
    </div>
  )
}
