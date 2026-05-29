# INVO - Invoice Escalation Platform

## ✅ COMPLETED: Full Stack Application

### Backend (Django + DRF)
- **Database Models**: Client, Invoice, EscalationRule, FreelancerProfile, ReminderEmail, CSVUpload
- **API Endpoints**: 
  - `/api/invoices/clients/` - CRUD for clients
  - `/api/invoices/invoices/` - CRUD for invoices with filtering
  - `/api/invoices/invoices/{id}/generate-reminder/` - AI email generation
  - `/api/invoices/invoices/{id}/mark-paid/` - Mark invoice as recovered
  - `/api/invoices/reminders/{id}/send/` - Send reminder email
  - `/api/invoices/dashboard/stats/` - Dashboard statistics
  - `/api/invoices/escalation-rules/` - User escalation settings
  - `/api/invoices/profile/` - Freelancer profile
  - `/api/invoices/upload-csv/` - CSV import
- **AI Integration**: Uses Vector LLM connector to generate 5-stage escalation emails
- **Authentication**: Vector Google OAuth (via @govector/auth)

### Frontend (React + TypeScript)
- **Pages**:
  - Landing page with Google Auth button
  - Dashboard with invoice table and overdue detection
  - Invoices page with add/upload forms
  - Clients page with management
  - Settings page with escalation rule configuration
- **Features**:
  - Sidebar navigation
  - Invoice status filtering
  - AI email preview and editing
  - Email sending with stage tracking
  - CSV upload with error reporting
  - Design system with dark theme and orange accents

## 🚀 END-TO-END FLOW

### 1. User Authentication
1. User clicks "Start Recovering" button on landing page
2. LoginButton redirects to Vector Google OAuth
3. User authenticates with Google account
4. Callback redirects to `/dashboard`

### 2. Create Invoice
1. Dashboard shows empty state with "Add Invoice" button
2. User clicks button, fills form:
   - Client name (creates client if doesn't exist)
   - Invoice amount (USD)
   - Due date (set to yesterday to test overdue)
   - Optional: description, client relationship tag
3. Submit creates invoice in database

### 3. Detect Overdue
1. Dashboard calculates `days_overdue` from invoice `due_date`
2. Invoice with past due_date shows as "overdue" with red urgency indicator
3. Color-coded: green (<7d), yellow (7-21d), orange (21-30d), red (30+d)

### 4. Generate AI Email (Day 0)
1. User clicks "Generate Reminder" action on overdue invoice
2. Modal opens with stage selector (1-5)
3. User clicks "Generate" → backend calls AI to create email
4. Subject and body are generated based on:
   - Days overdue
   - Invoice amount
   - Client name/company
   - Client relationship tag (new/repeat/VIP)
   - Escalation stage (determines tone: friendly → legal)
5. Email appears in modal for editing

### 5. Send Email & Track Stage
1. User reviews generated email
2. Optional: click "Warmer" or "Firmer" to regenerate with adjusted tone
3. Click "Send Now" → email sent to client via SMTP
4. ReminderEmail marked as "sent" with `sent_at` timestamp
5. Dashboard updates to show:
   - Stage dots (filled for sent stages)
   - "Reminders sent" count
   - Last reminder stage indicator

### 6. Track Recovery
1. Dashboard stats bar shows:
   - Total overdue amount
   - Count of overdue invoices
   - Average days overdue
   - Recovery rate (% of invoices marked recovered)
   - Amount recovered this month
2. User marks invoice as "Paid" when payment arrives
3. Invoice moves to "Recovered" status with green badge

## 📊 AI Escalation Stages

Each stage email is auto-generated with context-appropriate tone:

- **Stage 1 (Day 0)**: Friendly reminder - "assume they forgot"
- **Stage 2 (Day 3)**: Firm nudge - "invoice is now overdue"
- **Stage 3 (Day 7)**: Formal notice - "serious and direct"
- **Stage 4 (Day 14)**: Final warning - "urgent, legal action being considered"
- **Stage 5 (Day 21)**: Legal demand - "formal legal language"

All emails are fully editable before sending.

## 🔧 API Health Checks

```bash
# Check backend is running
curl http://localhost:8000/api/invoices/clients/ # Returns 401 (auth required)

# Check frontend is running
curl http://localhost:5173/ # Returns 200
```

## 📝 Testing the Complete Flow

1. **Sign in**: Click "Start Recovering" → Google OAuth → Dashboard
2. **Create invoice**: 
   - Set due date to yesterday (makes it immediately overdue)
   - Example: 2026-04-17 (testing overdue as of 2026-04-18)
3. **Generate email**: Click "Generate Reminder" → select Stage 1 → "Generate"
4. **Edit (optional)**: Click "Warmer" or "Firmer" to adjust tone
5. **Send**: Click "Send Now" → email is sent and logged
6. **Mark paid**: Click "Mark as Paid" when client pays
7. **View stats**: Dashboard shows updated recovery metrics

## 📦 Database Persistence

All data persists across sessions:
- Invoices stored with creation/update timestamps
- Escalation emails tracked with sent timestamps
- Client information cached for future invoices
- User settings (escalation rules) saved per account

## 🔐 Security

- All endpoints require authentication (Vector JWT cookie)
- User data scoped by request.user
- CSRF protection on all state-changing requests
- Client email validation

## 🎨 Design System

- **Background**: Dark charcoal (#111111)
- **Surfaces**: Dark graphite (#1C1C1C)
- **Primary action**: Electric orange (#F05A00)
- **Status indicators**: Cobalt blue (#1652F0), Sage green (#4A5C47)
- **Typography**: Monospace for numbers, sans-serif for labels
- **Data visualization**: Stage dots, color-coded urgency, timeline view

## 🚀 Next Steps (Optional Enhancements)

1. **Stripe Integration**: Pricing page with live checkout
2. **Invoice Detail Page**: Full escalation timeline view
3. **Analytics Page**: Revenue recovery over time
4. **PDF Demand Letter**: Auto-generate legally-worded demand letter
5. **Auto-send Rules**: Trigger emails automatically on day thresholds
6. **Webhook Integration**: Connect to Stripe for subscription tiers
7. **Email Delivery Tracking**: Track opens and clicks

---

**App Status**: ✅ Production-Ready MVP
**Authentication**: ✅ Google OAuth (Vector)
**Backend API**: ✅ All endpoints live and tested
**Frontend**: ✅ All pages built and styled
**AI Integration**: ✅ LLM email generation working
**Database**: ✅ Migrations applied, data persisting
