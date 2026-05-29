import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@govector/auth'
import { toast } from '@vector-ui'
import { getSubscription, updateSubscription } from '@/services/invoicesApi'

interface TierPricing {
  monthly: number
  yearly: number
  yearlyOriginal: number
}

interface Tier {
  id: string
  name: string
  pricing: TierPricing
  description: string
  features: string[]
  disabledFeatures: string[]
  accent: string
  popular: boolean
}

const TIERS: Tier[] = [
  {
    id: 'free',
    name: 'Free',
    pricing: { monthly: 0, yearly: 0, yearlyOriginal: 0 },
    description: 'Get started with basic invoice recovery',
    features: [
      '2 active invoices',
      'Stage 1-2 emails only',
      'AI-generated reminders',
      'Dashboard overview',
    ],
    disabledFeatures: [
      'No legal demand (Stage 5)',
      'No CSV import',
      'No relationship tags',
    ],
    accent: 'var(--color-muted)',
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    pricing: { monthly: 10, yearly: 96, yearlyOriginal: 120 },
    description: 'For freelancers who invoice regularly',
    features: [
      'Unlimited invoices',
      'All 5 escalation stages',
      'Editable email templates',
      'CSV batch import',
      'Relationship tags (New / Repeat / VIP)',
      'Email delivery tracking',
      'Priority support',
    ],
    disabledFeatures: [],
    accent: 'var(--color-accent)',
    popular: true,
  },
  {
    id: 'shield_plus',
    name: 'Shield+',
    pricing: { monthly: 30, yearly: 288, yearlyOriginal: 360 },
    description: 'Full recovery arsenal with legal teeth',
    features: [
      'Everything in Pro',
      'AI invoice scanner (PDF/JPG/PNG)',
      'Legal demand PDF download (Stage 5)',
      'Small claims court form auto-fill',
      'Demand letter templates',
      'Recovery analytics & reports',
    ],
    disabledFeatures: [],
    accent: '#8B0000',
    popular: false,
  },
]

export default function PricingPage() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [currentTier, setCurrentTier] = useState<string>('free')
  const [loadingTier, setLoadingTier] = useState<string | null>(null)
  const [tierLoaded, setTierLoaded] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')

  useEffect(() => {
    if (isAuthenticated) {
      getSubscription()
        .then(sub => {
          setCurrentTier(sub.tier)
          setTierLoaded(true)
        })
        .catch(() => setTierLoaded(true))
    } else {
      setTierLoaded(true)
    }
  }, [isAuthenticated])

  useEffect(() => {
    const success = searchParams.get('success')
    const tier = searchParams.get('tier')
    if (success === 'true' && tier) {
      updateSubscription(tier)
        .then(() => {
          setCurrentTier(tier)
          toast({ title: 'Subscription activated', description: `You're now on the ${tier === 'pro' ? 'Pro' : 'Shield+'} plan` })
          navigate('/dashboard', { replace: true })
        })
        .catch(() => {
          toast({ title: 'Error', description: 'Failed to activate subscription', variant: 'destructive' })
        })
    }
  }, [searchParams, navigate])

  const handleSubscribe = async (tierId: string) => {
    if (!isAuthenticated) {
      navigate('/')
      return
    }

    if (tierId === currentTier) return
    if (tierId === 'free') return

    setLoadingTier(tierId)
    try {
      await updateSubscription(tierId)
      setCurrentTier(tierId)
      toast({
        title: 'Subscription updated',
        description: `You're now on the ${tierId === 'pro' ? 'Pro' : 'Shield+'} plan`,
      })
      navigate('/dashboard')
    } catch {
      toast({ title: 'Error', description: 'Failed to update subscription', variant: 'destructive' })
    } finally {
      setLoadingTier(null)
    }
  }

  const getDisplayPrice = (tier: Tier) => {
    if (billingPeriod === 'yearly') {
      return tier.pricing.yearly
    }
    return tier.pricing.monthly
  }

  const getCtaLabel = (tier: Tier) => {
    const isCurrent = tierLoaded && currentTier === tier.id
    if (loadingTier === tier.id) return 'PROCESSING...'
    if (isCurrent) return 'CURRENT PLAN'
    if (tier.id === 'free') return 'FREE FOREVER'
    return `UPGRADE TO ${tier.name.toUpperCase()}`
  }

  return (
    <div style={{ padding: '32px', fontFamily: 'var(--font-body)', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--color-muted)', marginBottom: '8px' }}>
          PRICING
        </div>
        <h1 style={{
          fontSize: '36px', fontWeight: 900, margin: '0 0 12px',
          letterSpacing: '-0.03em', color: 'var(--color-fg)',
          fontFamily: 'var(--font-heading)',
        }}>
          Stop losing money to<br />late-paying clients
        </h1>
        <p style={{
          fontSize: '15px', color: 'var(--color-text-secondary)',
          margin: '0 auto 24px', maxWidth: '480px',
          lineHeight: 1.6,
        }}>
          Choose the plan that matches your billing volume.
          Upgrade or downgrade anytime.
        </p>

        {/* Billing toggle */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '12px',
          background: 'var(--color-surface)', padding: '4px',
          border: '1px solid var(--color-border)',
        }}>
          <button
            onClick={() => setBillingPeriod('monthly')}
            style={{
              padding: '8px 20px',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              background: billingPeriod === 'monthly' ? 'var(--color-accent)' : 'transparent',
              color: billingPeriod === 'monthly' ? 'white' : 'var(--color-muted)',
              transition: 'all var(--motion-fast)',
            }}
          >
            MONTHLY
          </button>
          <button
            onClick={() => setBillingPeriod('yearly')}
            style={{
              padding: '8px 20px',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              background: billingPeriod === 'yearly' ? 'var(--color-accent)' : 'transparent',
              color: billingPeriod === 'yearly' ? 'white' : 'var(--color-muted)',
              transition: 'all var(--motion-fast)',
            }}
          >
            YEARLY
          </button>
          {billingPeriod === 'yearly' && (
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              padding: '4px 8px',
              background: 'var(--color-success)',
              color: 'white',
              marginRight: '4px',
            }}>
              SAVE 20%
            </span>
          )}
        </div>
      </div>

      {/* Tier cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '2px',
        background: 'var(--color-border)',
        border: '1px solid var(--color-border)',
      }}>
        {TIERS.map(tier => {
          const isCurrent = tierLoaded && currentTier === tier.id
          const isUpgrade = tierLoaded && !isCurrent && tier.id !== 'free'
          const price = getDisplayPrice(tier)

          return (
            <div
              key={tier.id}
              style={{
                background: 'var(--color-surface)',
                padding: '32px 24px',
                position: 'relative',
                display: 'flex', flexDirection: 'column',
                minHeight: '480px',
                borderTop: tier.popular ? '3px solid var(--color-accent)' : '3px solid transparent',
              }}
            >
              {/* Popular badge */}
              {tier.popular && (
                <div style={{
                  position: 'absolute', top: '12px', right: '12px',
                  fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em',
                  padding: '3px 8px',
                  background: 'var(--color-accent)',
                  color: 'white',
                }}>
                  MOST POPULAR
                </div>
              )}

              {/* Tier name */}
              <div style={{
                fontSize: '11px', letterSpacing: '0.15em', color: 'var(--color-muted)',
                marginBottom: '8px', fontWeight: 600,
              }}>
                {tier.name.toUpperCase()}
              </div>

              {/* Price */}
              <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                {billingPeriod === 'yearly' && tier.pricing.yearlyOriginal > 0 && (
                  <span style={{
                    fontSize: '20px', fontWeight: 600, fontFamily: 'monospace',
                    color: 'var(--color-muted)', textDecoration: 'line-through',
                    marginRight: '6px', opacity: 0.6,
                  }}>
                    ${tier.pricing.yearlyOriginal}
                  </span>
                )}
                <span style={{
                  fontSize: '48px', fontWeight: 900, fontFamily: 'monospace',
                  letterSpacing: '-0.03em', lineHeight: 1,
                  color: 'var(--color-fg)',
                }}>
                  ${price}
                </span>
                <span style={{ fontSize: '14px', color: 'var(--color-muted)' }}>
                  {billingPeriod === 'yearly' ? '/yr' : '/mo'}
                </span>
              </div>

              {/* Description */}
              <div style={{
                fontSize: '13px', color: 'var(--color-text-secondary)',
                marginBottom: '24px', lineHeight: 1.5,
              }}>
                {tier.description}
              </div>

              {/* Features */}
              <div style={{ flex: 1, marginBottom: '24px' }}>
                {tier.features.map(f => (
                  <div key={f} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                    fontSize: '12px', color: 'var(--color-fg)',
                    marginBottom: '10px', lineHeight: 1.4,
                  }}>
                    <span style={{
                      color: tier.accent === 'var(--color-muted)' ? 'var(--color-success)' : tier.accent,
                      flexShrink: 0, marginTop: '1px', fontSize: '11px',
                    }}>
                      &#10003;
                    </span>
                    {f}
                  </div>
                ))}
                {tier.disabledFeatures.map(f => (
                  <div key={f} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                    fontSize: '12px', color: 'var(--color-muted)',
                    marginBottom: '10px', lineHeight: 1.4,
                    opacity: 0.6,
                  }}>
                    <span style={{ flexShrink: 0, marginTop: '1px', fontSize: '11px' }}>&#10007;</span>
                    {f}
                  </div>
                ))}
              </div>

              {/* CTA — pinned to bottom via flex */}
              <button
                onClick={() => handleSubscribe(tier.id)}
                disabled={isCurrent || loadingTier === tier.id}
                style={{
                  width: '100%',
                  padding: '14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  marginTop: 'auto',
                  border: isCurrent
                    ? '1px solid var(--color-border)'
                    : isUpgrade ? 'none' : '1px solid var(--color-border)',
                  background: isCurrent
                    ? 'transparent'
                    : isUpgrade ? tier.accent : 'transparent',
                  color: isCurrent
                    ? 'var(--color-muted)'
                    : isUpgrade ? 'white' : 'var(--color-muted)',
                  cursor: isCurrent ? 'default' : 'pointer',
                  fontFamily: 'var(--font-body)',
                  transition: 'all var(--motion-fast)',
                }}
              >
                {getCtaLabel(tier)}
              </button>
            </div>
          )
        })}
      </div>

      {/* Bottom note */}
      <div style={{
        textAlign: 'center', marginTop: '32px',
        fontSize: '12px', color: 'var(--color-muted)', lineHeight: 1.6,
      }}>
        All plans include AI-powered email generation and delivery tracking.
        <br />
        Cancel anytime. No long-term contracts.
      </div>
    </div>
  )
}
