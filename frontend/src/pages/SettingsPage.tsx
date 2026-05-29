import { useState, useEffect } from 'react'
import { toast } from '@vector-ui'
import {
  getEscalationRules,
  updateEscalationRules,
  getFreelancerProfile,
  updateFreelancerProfile,
  type EscalationRules,
  type FreelancerProfile,
} from '@/services/invoicesApi'

const STAGE_INFO = [
  { stage: 1, label: 'Friendly Reminder', description: 'Warm, understanding — assume they forgot', color: '#1652F0' },
  { stage: 2, label: 'Firm Nudge', description: 'Professional tone, invoice now overdue', color: '#F59E0B' },
  { stage: 3, label: 'Formal Notice', description: 'Serious and direct, mention consequences', color: '#F05A00' },
  { stage: 4, label: 'Final Warning', description: 'Urgent, legal action being considered', color: '#FF3B30' },
  { stage: 5, label: 'Legal Demand', description: 'Formal legal language, demand payment', color: '#8B0000' },
]

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional', desc: 'Balanced and business-like' },
  { value: 'friendly', label: 'Friendly', desc: 'Warm and relationship-focused' },
  { value: 'firm', label: 'Firm', desc: 'Direct and no-nonsense' },
]

export default function SettingsPage() {
  const [profile, setProfile] = useState<FreelancerProfile>({ display_name: '', business_name: '', email: '', subscription_tier: 'free' })
  const [rules, setRules] = useState<EscalationRules>({
    stage_1_days: 1,
    stage_2_days: 8,
    stage_3_days: 15,
    stage_4_days: 22,
    stage_5_days: 30,
    auto_send_1: false,
    auto_send_2: false,
    auto_send_3: false,
    auto_send_4: false,
    auto_send_5: false,
    default_tone: 'professional',
  })
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingRules, setSavingRules] = useState(false)

  useEffect(() => {
    Promise.all([getFreelancerProfile(), getEscalationRules()])
      .then(([p, r]) => { setProfile(p); setRules(r) })
      .catch(() => toast({ title: 'Error loading settings', variant: 'destructive' }))
      .finally(() => setLoading(false))
  }, [])

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      await updateFreelancerProfile(profile)
      toast({ title: 'Profile saved' })
    } catch {
      toast({ title: 'Error saving profile', variant: 'destructive' })
    } finally {
      setSavingProfile(false)
    }
  }

  const saveRules = async () => {
    setSavingRules(true)
    try {
      await updateEscalationRules(rules)
      toast({ title: 'Escalation rules saved' })
    } catch {
      toast({ title: 'Error saving rules', variant: 'destructive' })
    } finally {
      setSavingRules(false)
    }
  }

  const stageKey = (n: number, suffix: string) => `stage_${n}_${suffix}` as keyof EscalationRules
  const autoSendKey = (n: number) => `auto_send_${n}` as keyof EscalationRules

  if (loading) {
    return (
      <div style={{ padding: '32px', color: 'var(--color-muted)', fontSize: '13px' }}>Loading settings...</div>
    )
  }

  return (
    <div style={{ padding: '32px', fontFamily: 'var(--font-body)', maxWidth: '700px' }}>
      <div style={{ marginBottom: '40px' }}>
        <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '6px' }}>CONFIGURATION</div>
        <h1 style={{ fontSize: '28px', fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>Settings</h1>
      </div>

      {/* Freelancer Profile */}
      <section style={{ marginBottom: '48px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em' }}>Freelancer Profile</div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>Used in AI-generated reminder emails</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { label: 'DISPLAY NAME', key: 'display_name', placeholder: 'Alex Johnson', type: 'text' },
            { label: 'BUSINESS NAME', key: 'business_name', placeholder: 'Johnson Design Studio', type: 'text' },
            { label: 'SENDER EMAIL', key: 'email', placeholder: 'alex@designstudio.com', type: 'email' },
          ].map(f => (
            <div key={f.key}>
              <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '5px' }}>{f.label}</div>
              <input
                type={f.type}
                value={profile[f.key as keyof FreelancerProfile]}
                onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                style={inputStyle}
              />
            </div>
          ))}

          <button
            onClick={saveProfile}
            disabled={savingProfile}
            style={{
              padding: '11px 24px', background: 'var(--color-accent)',
              color: 'white', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
              alignSelf: 'flex-start',
            }}
          >
            {savingProfile ? 'SAVING...' : 'SAVE PROFILE'}
          </button>
        </div>
      </section>

      {/* Default Tone */}
      <section style={{ marginBottom: '48px' }}>
        <div style={{ marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em' }}>Default AI Tone</div>
          <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>Applied when generating reminder emails</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TONE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setRules(r => ({ ...r, default_tone: opt.value as EscalationRules['default_tone'] }))}
              style={{
                padding: '12px 16px', flex: 1, minWidth: '140px',
                border: `1px solid ${rules.default_tone === opt.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: rules.default_tone === opt.value ? 'rgba(240,90,0,0.08)' : 'transparent',
                color: rules.default_tone === opt.value ? 'var(--color-fg)' : 'var(--color-muted)',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', marginBottom: '3px' }}>
                {rules.default_tone === opt.value && <span style={{ color: 'var(--color-accent)' }}>✓ </span>}
                {opt.label.toUpperCase()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-muted)' }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Escalation Rules */}
      <section style={{ marginBottom: '32px' }}>
        <div style={{ marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.04em' }}>Escalation Stage Triggers</div>
          <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>Days overdue before each escalation stage activates</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {STAGE_INFO.map(({ stage, label, description, color }) => {
            const days = rules[stageKey(stage, 'days')] as number
            const autoSend = rules[autoSendKey(stage)] as boolean

            return (
              <div
                key={stage}
                style={{
                  padding: '16px',
                  borderBottom: '1px solid var(--color-border)',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto auto',
                  gap: '16px',
                  alignItems: 'center',
                  background: 'var(--color-surface)',
                }}
              >
                {/* Stage info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '28px', height: '28px', flexShrink: 0,
                    background: `${color}20`,
                    border: `1px solid ${color}50`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 700, color,
                  }}>
                    {stage}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-fg)' }}>{label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '1px' }}>{description}</div>
                  </div>
                </div>

                {/* Day trigger */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '4px' }}>AFTER DAYS</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => setRules(r => ({ ...r, [stageKey(stage, 'days')]: Math.max(1, days - 1) }))}
                      style={{ ...counterBtn, borderColor: color + '40' }}
                    >
                      −
                    </button>
                    <span style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, minWidth: '32px', textAlign: 'center', color }}>{days}</span>
                    <button
                      onClick={() => setRules(r => ({ ...r, [stageKey(stage, 'days')]: days + 1 }))}
                      style={{ ...counterBtn, borderColor: color + '40' }}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Auto-send toggle */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '6px' }}>AUTO-SEND</div>
                  <button
                    onClick={() => setRules(r => ({ ...r, [autoSendKey(stage)]: !autoSend }))}
                    style={{
                      width: '42px', height: '22px',
                      background: autoSend ? 'var(--color-accent)' : 'var(--color-border)',
                      border: 'none', borderRadius: '11px',
                      cursor: 'pointer', position: 'relative',
                      transition: 'background 0.2s',
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      top: '3px',
                      left: autoSend ? '23px' : '3px',
                      width: '16px', height: '16px',
                      background: 'white',
                      borderRadius: '50%',
                      transition: 'left 0.2s',
                    }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Day visualization */}
        <div style={{ marginTop: '16px', padding: '16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: 'var(--color-muted)', marginBottom: '10px' }}>ESCALATION TIMELINE</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0', position: 'relative' }}>
            {STAGE_INFO.map(({ stage, color }, i) => {
              const days = rules[stageKey(stage, 'days')] as number
              return (
                <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
                    <div style={{
                      width: '12px', height: '12px', borderRadius: '50%',
                      background: color, flexShrink: 0,
                    }} />
                    <div style={{ fontSize: '10px', color, fontWeight: 700, fontFamily: 'monospace' }}>d{days}</div>
                    <div style={{ fontSize: '9px', color: 'var(--color-muted)', letterSpacing: '0.06em' }}>S{stage}</div>
                  </div>
                  {i < STAGE_INFO.length - 1 && (
                    <div style={{ flex: 1, height: '1px', background: 'var(--color-border)', minWidth: '12px' }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Warning about auto-send */}
        {STAGE_INFO.some(({ stage }) => rules[autoSendKey(stage)] as boolean) && (
          <div style={{
            marginTop: '12px', padding: '10px 14px',
            background: 'rgba(240,90,0,0.08)', border: '1px solid rgba(240,90,0,0.2)',
            fontSize: '11px', color: 'var(--color-accent)', lineHeight: 1.5,
          }}>
            ⚠ Auto-send is enabled for some stages. Emails will be sent automatically when a reminder's stage trigger day is reached.
          </div>
        )}

        <button
          onClick={saveRules}
          disabled={savingRules}
          style={{
            marginTop: '20px', padding: '11px 24px', background: 'var(--color-accent)',
            color: 'white', border: 'none', cursor: 'pointer',
            fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em',
          }}
        >
          {savingRules ? 'SAVING...' : 'SAVE ESCALATION RULES'}
        </button>
      </section>
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

const counterBtn: React.CSSProperties = {
  width: '24px', height: '24px',
  background: 'transparent',
  border: '1px solid var(--color-border)',
  color: 'var(--color-muted)',
  cursor: 'pointer',
  fontSize: '14px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0,
}
