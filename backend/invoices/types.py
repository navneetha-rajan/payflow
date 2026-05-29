from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel


class ToneAdjustment(StrEnum):
    WARMER = "warmer"
    FIRMER = "firmer"


class ReminderGenerationInput(BaseModel):
    days_overdue: int
    invoice_amount: float
    invoice_number: str
    currency: str
    client_name: str
    client_company: str
    relationship_type: str
    freelancer_name: str
    freelancer_business: str
    stage: int
    default_tone: str
    tone_adjustment: str | None = None


class ReminderGenerationResult(BaseModel):
    subject: str
    body: str


class DashboardStats(BaseModel):
    total_overdue_amount: float
    total_overdue_count: int
    avg_days_overdue: float
    recovery_rate: float
    recovered_this_month: float


class FinancialOverview(BaseModel):
    revenue_this_month: float
    revenue_last_month: float
    revenue_change_pct: float
    revenue_this_year: float
    outstanding_amount: float
    outstanding_count: int
    overdue_amount: float
    overdue_count: int
    recovered_this_month: float
    paid_on_time_rate: float
    avg_days_to_payment: float
    total_overdue_amount: float
    total_overdue_count: int
    avg_days_overdue: float
    recovery_rate: float


class ClientFinancialSummary(BaseModel):
    client_id: str
    client_name: str
    total_billed: float
    total_paid: float
    total_outstanding: float
    avg_days_to_pay: float
    reliability_score: str
    invoice_count: int


class MonthlyRevenue(BaseModel):
    month: str
    revenue: float


class StatusBreakdown(BaseModel):
    status: str
    count: int
    amount: float


class TopClient(BaseModel):
    client_name: str
    revenue: float


class InvoiceScanResult(BaseModel):
    invoice_number: str | None = None
    client_name: str | None = None
    client_email: str | None = None
    project_name: str | None = None
    amount: float | None = None
    currency: str = "USD"
    due_date: str | None = None
    issue_date: str | None = None
    status: str | None = None
    line_items: list[dict] = []
    subtotal: float | None = None
    tax_amount: float | None = None
    total_amount: float | None = None
    notes: str | None = None
