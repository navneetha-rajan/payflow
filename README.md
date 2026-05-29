# PayFlow

**AI-powered invoice recovery platform for freelancers.**

PayFlow automates overdue payment collection with intelligent, escalating email sequences — so freelancers get paid without damaging client relationships.

---

## The Problem

Solo freelancers and small teams lose 5-15 hours per month manually chasing overdue invoices via email and spreadsheets. Late payments hurt cash flow, and aggressive follow-ups risk burning client relationships.

## The Solution

PayFlow generates and sends professional, AI-crafted payment reminders that escalate in tone over 5 stages — from a friendly nudge to a formal legal demand — based on how many days an invoice is overdue and the client relationship type.

---

## Features

### Invoice Management
- **Create invoices** manually or via **CSV batch import** (flexible column parsing — works with FreshBooks, Wave, spreadsheet exports)
- **AI invoice scanner** — upload PDF, JPG, or PNG and Claude AI extracts all invoice fields automatically
- Track every financial state: Draft, Sent, Paid, Partially Paid, Overdue, Written Off, Disputed
- **Mark as Paid** flow with payment method, date, and partial payment support

### 5-Stage Escalation Engine
| Stage | Tone | Default Trigger |
|-------|------|----------------|
| 1 | Friendly Reminder | 1 day overdue |
| 2 | Firm Nudge | 7 days overdue |
| 3 | Formal Notice | 14 days overdue |
| 4 | Final Warning | 21 days overdue |
| 5 | Legal Demand | 30 days overdue |

- AI generates context-aware emails using client relationship tags (New / Repeat / VIP)
- Full email preview and editing before sending
- Configurable day thresholds per stage
- Auto-send capability with per-stage toggle

### Financial Dashboard
- Revenue tracking: this month vs last month with percentage change, year-to-date
- Outstanding vs overdue breakdown
- Recovery rate and paid-on-time percentage
- Monthly revenue bar chart (12 months)
- Invoice status donut chart
- Top 5 clients by revenue
- Overdue invoices table with escalation stage indicators

### Client Profiles
- Complete financial history per client
- Total billed, paid, outstanding
- Payment reliability score (Excellent / Good / Unreliable)
- Average days to payment

### Email Delivery
- SMTP email delivery with status tracking
- Full email timeline on every invoice — see exactly what was sent, when, and whether it was delivered
- Resend and retry capabilities

### Financial Exports
- **Invoice CSV export** — all invoices with all fields for a date range
- **Tax summary** — monthly income totals formatted for accountants

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| Backend | Django 5.2, Django REST Framework |
| Database | SQLite (via django-libsql) |
| AI | Claude (via Vector LLM connector) |
| Auth | Google OAuth (via Vector hosted auth) |
| Email | SMTP with delivery tracking |
| UI Components | Radix UI primitives + custom design system |

---

## API Endpoints

### Invoices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/invoices/invoices/` | List / create invoices |
| GET/PATCH | `/api/invoices/invoices/{id}/` | Retrieve / update invoice |
| POST | `/api/invoices/invoices/{id}/generate-reminder/` | Generate AI email for stage |
| POST | `/api/invoices/invoices/{id}/mark-paid/` | Record payment |
| POST | `/api/invoices/upload-csv/` | Batch CSV import |
| POST | `/api/invoices/scan/` | AI invoice scanner |
| GET | `/api/invoices/export/` | Export invoices CSV |
| GET | `/api/invoices/export/tax-summary/` | Tax summary export |

### Dashboard & Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invoices/dashboard/stats/` | Dashboard statistics |
| GET | `/api/invoices/financial/overview/` | Full financial overview |
| GET | `/api/invoices/financial/client/{id}/` | Client financial profile |

### Clients
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/invoices/clients/` | List / create clients |
| GET/PATCH | `/api/invoices/clients/{id}/` | Retrieve / update client |

### Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/invoices/escalation-rules/` | Escalation stage config |
| GET/PATCH | `/api/invoices/profile/` | Freelancer profile |

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/accounts/auth/token` | Exchange JWT for session |
| POST | `/api/accounts/auth/refresh` | Refresh access token |
| GET | `/api/accounts/me/` | Current user info |
| POST | `/api/accounts/logout/` | Logout |

---

## Design

Dark-first UI with an orange accent palette:

- **Background:** `#111111` (charcoal)
- **Surfaces:** `#1C1C1C` (graphite)
- **Primary accent:** `#F05A00` (electric orange)
- **Info:** `#1652F0` (cobalt blue)
- **Success:** `#4A5C47` (sage green)
- **Typography:** Inter / DM Sans

---

## License

MIT
