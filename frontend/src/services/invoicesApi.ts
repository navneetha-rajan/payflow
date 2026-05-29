import { api } from './api'

export interface Client {
  id: string
  name: string
  email: string
  company: string
  relationship_type: 'new' | 'repeat' | 'vip'
  notes: string
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  invoice: string
  amount: string
  payment_date: string
  payment_method: string
  notes: string
  created_at: string
}

export interface Invoice {
  id: string
  client: Client
  invoice_number: string
  amount: string
  currency: string
  issue_date: string
  due_date: string
  status: 'draft' | 'sent' | 'pending' | 'partial' | 'recovered' | 'overdue' | 'written_off' | 'disputed'
  amount_paid: string
  description: string
  source: 'manual' | 'csv' | 'scan'
  line_items: Array<{ description: string; quantity: number; unit_price: number; total: number }>
  subtotal: string | null
  tax_amount: string | null
  notes: string
  payment_date: string | null
  payment_method: string
  payment_notes: string
  days_overdue: number
  is_overdue: boolean
  remaining_balance: string
  reminders_sent: number
  last_reminder_stage: number | null
  payments: Payment[]
  has_document: boolean
  scanned_document_id: string | null
  created_at: string
  updated_at: string
}

export interface ReminderEmail {
  id: string
  invoice: string
  stage: number
  subject: string
  body: string
  status: 'draft' | 'sent' | 'failed' | 'paused'
  sent_at: string | null
  ai_generated: boolean
  recipient_email: string
  email_message_id: string
  created_at: string
  updated_at: string
}

export interface DashboardStats {
  total_overdue_amount: number
  total_overdue_count: number
  avg_days_overdue: number
  recovery_rate: number
  recovered_this_month: number
}

export interface FinancialOverview {
  revenue_this_month: number
  revenue_last_month: number
  revenue_change_pct: number
  revenue_this_year: number
  outstanding_amount: number
  outstanding_count: number
  overdue_amount: number
  overdue_count: number
  recovered_this_month: number
  paid_on_time_rate: number
  avg_days_to_payment: number
  total_overdue_amount: number
  total_overdue_count: number
  avg_days_overdue: number
  recovery_rate: number
}

export interface MonthlyRevenue {
  month: string
  revenue: number
}

export interface StatusBreakdown {
  status: string
  count: number
  amount: number
}

export interface TopClient {
  client_name: string
  revenue: number
}

export interface FinancialData {
  overview: FinancialOverview
  monthly_revenue: MonthlyRevenue[]
  status_breakdown: StatusBreakdown[]
  top_clients: TopClient[]
}

export interface ClientFinancialSummary {
  client_id: string
  client_name: string
  total_billed: number
  total_paid: number
  total_outstanding: number
  avg_days_to_pay: number
  reliability_score: string
  invoice_count: number
}

export interface ClientFinancialData {
  summary: ClientFinancialSummary
  invoices: Invoice[]
}

export interface InvoiceScanResult {
  document_id: string
  extracted: {
    invoice_number: string | null
    client_name: string | null
    client_email: string | null
    project_name: string | null
    amount: number | null
    currency: string
    due_date: string | null
    issue_date: string | null
    status: string | null
    line_items: Array<{ description: string; quantity: number; unit_price: number; total: number }>
    subtotal: number | null
    tax_amount: number | null
    total_amount: number | null
    notes: string | null
  }
}

export interface EscalationRules {
  stage_1_days: number
  stage_2_days: number
  stage_3_days: number
  stage_4_days: number
  stage_5_days: number
  auto_send_1: boolean
  auto_send_2: boolean
  auto_send_3: boolean
  auto_send_4: boolean
  auto_send_5: boolean
  default_tone: 'professional' | 'friendly' | 'firm'
}

export interface FreelancerProfile {
  display_name: string
  business_name: string
  email: string
  subscription_tier: 'free' | 'pro' | 'shield_plus'
}

export interface Subscription {
  tier: 'free' | 'pro' | 'shield_plus'
  stripe_customer_id: string | null
}

// Clients
export const getClients = () =>
  api.get('/api/invoices/clients/').then(r => {
    const data = r.data as any
    return Array.isArray(data) ? data : (data?.results || data?.data || [])
  })
export const createClient = (data: Partial<Client>) => api.post<Client>('/api/invoices/clients/', data).then(r => r.data)
export const updateClient = (id: string, data: Partial<Client>) => api.patch<Client>(`/api/invoices/clients/${id}/`, data).then(r => r.data)
export const deleteClient = (id: string) => api.delete(`/api/invoices/clients/${id}/`)

// Invoices
export const getInvoices = (params?: Record<string, string>) =>
  api.get('/api/invoices/invoices/', { params }).then(r => {
    const data = r.data as any
    return Array.isArray(data) ? data : (data?.results || data?.data || [])
  })

export const getInvoice = (id: string) =>
  api.get<Invoice>(`/api/invoices/invoices/${id}/`).then(r => r.data)

export const createInvoice = (data: {
  client_id: string
  invoice_number: string
  amount: number
  currency?: string
  issue_date: string
  due_date: string
  description?: string
  line_items?: Array<{ description: string; quantity: number; unit_price: number; total: number }>
  subtotal?: number
  tax_amount?: number
  notes?: string
  scanned_document_id?: string
}) => api.post<Invoice>('/api/invoices/invoices/', data).then(r => r.data)

export const updateInvoice = (id: string, data: Partial<Invoice>) =>
  api.patch<Invoice>(`/api/invoices/invoices/${id}/`, data).then(r => r.data)

export const deleteInvoice = (id: string) => api.delete(`/api/invoices/invoices/${id}/`)

export const markPaid = (id: string, data?: { payment_method?: string; payment_date?: string; notes?: string }) =>
  api.post<Invoice>(`/api/invoices/invoices/${id}/mark-paid/`, data || {}).then(r => r.data)

export const markPartial = (id: string, amountPaid: number, data?: { payment_method?: string; payment_date?: string; notes?: string }) =>
  api.post<Invoice>(`/api/invoices/invoices/${id}/mark-partial/`, { amount_paid: amountPaid, ...data }).then(r => r.data)

export const markDisputed = (id: string) =>
  api.post<Invoice>(`/api/invoices/invoices/${id}/mark-disputed/`).then(r => r.data)

export const writeOff = (id: string) =>
  api.post<Invoice>(`/api/invoices/invoices/${id}/write-off/`).then(r => r.data)

export const getInvoiceReminders = (id: string) =>
  api.get<ReminderEmail[]>(`/api/invoices/invoices/${id}/reminders/`).then(r => r.data)

export const getInvoicePayments = (id: string) =>
  api.get<Payment[]>(`/api/invoices/invoices/${id}/payments/`).then(r => r.data)

// Reminders
export const generateReminder = (invoiceId: string, stage: number, toneAdjustment?: string) =>
  api.post<ReminderEmail>(`/api/invoices/invoices/${invoiceId}/generate-reminder/`, {
    stage,
    tone_adjustment: toneAdjustment,
  }).then(r => r.data)

export const updateReminder = (id: string, data: { subject?: string; body?: string }) =>
  api.patch<ReminderEmail>(`/api/invoices/reminders/${id}/`, data).then(r => r.data)

export const sendReminder = (id: string) =>
  api.post<ReminderEmail>(`/api/invoices/reminders/${id}/send/`).then(r => r.data)

// Dashboard
export const getDashboardStats = () =>
  api.get<DashboardStats>('/api/invoices/dashboard/stats/').then(r => r.data)

// Financial overview
export const getFinancialOverview = () =>
  api.get<FinancialData>('/api/invoices/financial/overview/').then(r => r.data)

// Client financial profile
export const getClientFinancial = (clientId: string) =>
  api.get<ClientFinancialData>(`/api/invoices/financial/client/${clientId}/`).then(r => r.data)

// Invoice scanner
export const scanInvoice = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post<InvoiceScanResult>(
    '/api/invoices/scan/',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  ).then(r => r.data)
}

// Document viewer
export const getDocumentUrl = (docId: string) => `/api/invoices/documents/${docId}/`

// Exports
export const exportInvoicesUrl = (startDate?: string, endDate?: string) => {
  const params = new URLSearchParams()
  if (startDate) params.set('start_date', startDate)
  if (endDate) params.set('end_date', endDate)
  return `/api/invoices/financial/export/invoices/?${params.toString()}`
}

export const exportTaxSummaryUrl = (year?: number) => {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  return `/api/invoices/financial/export/tax-summary/?${params.toString()}`
}

// Settings
export const getEscalationRules = () =>
  api.get<EscalationRules>('/api/invoices/escalation-rules/').then(r => r.data)

export const updateEscalationRules = (data: EscalationRules) =>
  api.put<EscalationRules>('/api/invoices/escalation-rules/', data).then(r => r.data)

export const getFreelancerProfile = () =>
  api.get<FreelancerProfile>('/api/invoices/profile/').then(r => r.data)

export const updateFreelancerProfile = (data: FreelancerProfile) =>
  api.put<FreelancerProfile>('/api/invoices/profile/', data).then(r => r.data)

// Subscription
export const getSubscription = () =>
  api.get<Subscription>('/api/invoices/subscription/').then(r => r.data)

export const updateSubscription = (tier: string) =>
  api.post<{ tier: string }>('/api/invoices/subscription/', { tier }).then(r => r.data)

// Retry all failed/paused emails
export const retryAllFailed = () =>
  api.post<{ sent: number; still_failed: number; total_attempted: number }>(
    '/api/invoices/reminders/retry-all-failed/'
  ).then(r => r.data)

// CSV Upload
export const uploadCSV = (file: File, columnMapping: Record<string, string>) => {
  const formData = new FormData()
  formData.append('file', file)
  Object.entries(columnMapping).forEach(([key, val]) => formData.append(key, val))
  return api.post<{ rows_imported: number; rows_failed: number; errors: string[] }>(
    '/api/invoices/upload-csv/',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  ).then(r => r.data)
}
