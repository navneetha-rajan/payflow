from __future__ import annotations

import base64
import csv
import io
import json
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

from django.db.models import Avg, Q, Sum

from connectors.connector_llm import (
    ChatCompletionRequest,
    ChatMessage,
    ChatRole,
    ConnectorAPIError,
    ConnectorVariant,
    LLMChatRequest,
    call_llm_chat,
)

from .models import (
    Client,
    DefaultTone,
    EscalationRule,
    FreelancerProfile,
    Invoice,
    InvoiceStatus,
    Payment,
    PaymentMethod,
    ReminderEmail,
    ReminderStatus,
    ScannedDocument,
)
from .types import (
    ClientFinancialSummary,
    DashboardStats,
    FinancialOverview,
    InvoiceScanResult,
    MonthlyRevenue,
    ReminderGenerationInput,
    ReminderGenerationResult,
    StatusBreakdown,
    TopClient,
)

logger = logging.getLogger(__name__)

STAGE_PERSONAS = {
    1: "friendly reminder — warm, understanding tone, assume they just forgot",
    2: "firm nudge — professional tone, note the invoice is now overdue",
    3: "formal notice — serious and direct, mention potential consequences",
    4: "final warning — urgent, state that legal action is being considered",
    5: "legal demand — formal legal language, demand immediate payment",
}


# ---------------------------------------------------------------------------
# Reminder generation & sending
# ---------------------------------------------------------------------------

def generate_reminder_email(
    invoice: Invoice,
    stage: int,
    user,
    tone_adjustment: str | None = None,
) -> ReminderGenerationResult:
    profile = _get_or_create_profile(user)
    input_data = ReminderGenerationInput(
        days_overdue=invoice.days_overdue,
        invoice_amount=float(invoice.amount),
        invoice_number=invoice.invoice_number,
        currency=invoice.currency,
        client_name=invoice.client.name,
        client_company=invoice.client.company,
        relationship_type=invoice.client.relationship_type,
        freelancer_name=profile.display_name or getattr(user, "full_name", "") or user.email,
        freelancer_business=profile.business_name,
        stage=stage,
        default_tone=_get_default_tone(user),
        tone_adjustment=tone_adjustment,
    )
    prompt = _build_reminder_prompt(input_data)
    return _call_llm_for_reminder(prompt, user)


def send_reminder_email(reminder: ReminderEmail) -> bool:
    import uuid

    from django.core.mail import EmailMessage

    recipient = reminder.invoice.client.email
    if not recipient:
        logger.error("No email for client %s on invoice %s", reminder.invoice.client.name, reminder.invoice.invoice_number)
        reminder.status = ReminderStatus.FAILED
        reminder.recipient_email = ""
        reminder.save(update_fields=["status", "recipient_email"])
        return False

    reminder.recipient_email = recipient
    sender_email = _get_sender_email(reminder.invoice.user)

    try:
        msg = EmailMessage(
            subject=reminder.subject,
            body=reminder.body,
            from_email=sender_email,
            to=[recipient],
        )
        tracking_id = f"<payflow-{uuid.uuid4().hex[:12]}@payflow.app>"
        msg.extra_headers = {"Message-ID": tracking_id}
        msg.send(fail_silently=False)

        reminder.status = ReminderStatus.SENT
        reminder.sent_at = datetime.now(timezone.utc)
        reminder.email_message_id = tracking_id
        reminder.save(update_fields=["status", "sent_at", "recipient_email", "email_message_id"])
        logger.info(
            "Email sent: invoice=%s stage=%s to=%s message_id=%s",
            reminder.invoice.invoice_number, reminder.stage, recipient, tracking_id,
        )
        return True
    except Exception:
        logger.exception(
            "Email failed: invoice=%s stage=%s to=%s",
            reminder.invoice.invoice_number, reminder.stage, recipient,
        )
        reminder.status = ReminderStatus.FAILED
        reminder.save(update_fields=["status", "recipient_email"])
        return False


# ---------------------------------------------------------------------------
# Dashboard stats (legacy — kept for backward compatibility)
# ---------------------------------------------------------------------------

def get_dashboard_stats(user) -> DashboardStats:
    all_user_invoices = Invoice.objects.filter(
        user=user,
        status__in=[InvoiceStatus.PENDING, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE],
    )
    today = date.today()
    overdue = [inv for inv in all_user_invoices if inv.due_date < today]

    total_amount = sum(float(inv.amount) - float(inv.amount_paid) for inv in overdue)
    avg_days = sum(inv.days_overdue for inv in overdue) / len(overdue) if overdue else 0.0

    total_invoices = Invoice.objects.filter(user=user).count()
    recovered_count = Invoice.objects.filter(user=user, status=InvoiceStatus.RECOVERED).count()
    recovery_rate = (recovered_count / total_invoices * 100) if total_invoices > 0 else 0.0

    now = datetime.now(timezone.utc)
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        month_end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        month_end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)

    recovered_this_month = (
        Invoice.objects.filter(
            user=user,
            status=InvoiceStatus.RECOVERED,
            updated_at__gte=month_start,
            updated_at__lt=month_end,
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )

    return DashboardStats(
        total_overdue_amount=round(total_amount, 2),
        total_overdue_count=len(overdue),
        avg_days_overdue=round(avg_days, 1),
        recovery_rate=round(recovery_rate, 1),
        recovered_this_month=float(recovered_this_month),
    )


# ---------------------------------------------------------------------------
# Financial overview (new comprehensive stats)
# ---------------------------------------------------------------------------

def get_financial_overview(user) -> FinancialOverview:
    now = datetime.now(timezone.utc)
    today = date.today()

    # Month boundaries
    this_month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        this_month_end = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        this_month_end = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)

    if now.month == 1:
        last_month_start = datetime(now.year - 1, 12, 1, tzinfo=timezone.utc)
    else:
        last_month_start = datetime(now.year, now.month - 1, 1, tzinfo=timezone.utc)
    last_month_end = this_month_start

    year_start = datetime(now.year, 1, 1, tzinfo=timezone.utc)

    all_invoices = Invoice.objects.filter(user=user)

    # Revenue this month (recovered invoices)
    revenue_this_month = float(
        all_invoices.filter(
            status=InvoiceStatus.RECOVERED,
            updated_at__gte=this_month_start,
            updated_at__lt=this_month_end,
        ).aggregate(t=Sum("amount_paid"))["t"] or 0
    )

    revenue_last_month = float(
        all_invoices.filter(
            status=InvoiceStatus.RECOVERED,
            updated_at__gte=last_month_start,
            updated_at__lt=last_month_end,
        ).aggregate(t=Sum("amount_paid"))["t"] or 0
    )

    revenue_change_pct = 0.0
    if revenue_last_month > 0:
        revenue_change_pct = round(((revenue_this_month - revenue_last_month) / revenue_last_month) * 100, 1)

    revenue_this_year = float(
        all_invoices.filter(
            status=InvoiceStatus.RECOVERED,
            updated_at__gte=year_start,
        ).aggregate(t=Sum("amount_paid"))["t"] or 0
    )

    # Outstanding (sent but not due yet)
    outstanding_qs = all_invoices.filter(
        status__in=[InvoiceStatus.PENDING, InvoiceStatus.SENT],
        due_date__gte=today,
    )
    outstanding_amount = float(outstanding_qs.aggregate(t=Sum("amount"))["t"] or 0)
    outstanding_count = outstanding_qs.count()

    # Overdue
    overdue_qs = all_invoices.filter(
        status__in=[InvoiceStatus.PENDING, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE],
        due_date__lt=today,
    )
    overdue_amount = float(
        sum(float(inv.amount) - float(inv.amount_paid) for inv in overdue_qs)
    )
    overdue_count = overdue_qs.count()

    # Recovery rate
    total_count = all_invoices.exclude(status__in=[InvoiceStatus.DRAFT]).count()
    recovered_count = all_invoices.filter(status=InvoiceStatus.RECOVERED).count()
    recovery_rate = round((recovered_count / total_count * 100) if total_count > 0 else 0.0, 1)

    # Paid on time rate
    recovered_invoices = all_invoices.filter(status=InvoiceStatus.RECOVERED)
    paid_on_time = sum(
        1 for inv in recovered_invoices
        if inv.payment_date and inv.payment_date <= inv.due_date
    )
    paid_on_time_rate = round(
        (paid_on_time / recovered_invoices.count() * 100) if recovered_invoices.count() > 0 else 0.0, 1
    )

    # Average days to payment
    days_list = []
    for inv in recovered_invoices:
        if inv.payment_date:
            delta = (inv.payment_date - inv.issue_date).days
            days_list.append(max(0, delta))
    avg_days_to_payment = round(sum(days_list) / len(days_list), 1) if days_list else 0.0

    # Avg days overdue for current overdue
    overdue_list = list(overdue_qs)
    avg_days_overdue = round(
        sum(inv.days_overdue for inv in overdue_list) / len(overdue_list), 1
    ) if overdue_list else 0.0

    return FinancialOverview(
        revenue_this_month=round(revenue_this_month, 2),
        revenue_last_month=round(revenue_last_month, 2),
        revenue_change_pct=revenue_change_pct,
        revenue_this_year=round(revenue_this_year, 2),
        outstanding_amount=round(outstanding_amount, 2),
        outstanding_count=outstanding_count,
        overdue_amount=round(overdue_amount, 2),
        overdue_count=overdue_count,
        recovered_this_month=round(revenue_this_month, 2),
        paid_on_time_rate=paid_on_time_rate,
        avg_days_to_payment=avg_days_to_payment,
        total_overdue_amount=round(overdue_amount, 2),
        total_overdue_count=overdue_count,
        avg_days_overdue=avg_days_overdue,
        recovery_rate=recovery_rate,
    )


def get_monthly_revenue(user, months: int = 12) -> list[MonthlyRevenue]:
    """Get revenue per month for the last N months."""
    now = datetime.now(timezone.utc)
    result: list[MonthlyRevenue] = []

    for i in range(months - 1, -1, -1):
        month = now.month - i
        year = now.year
        while month <= 0:
            month += 12
            year -= 1

        m_start = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            m_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            m_end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

        rev = float(
            Invoice.objects.filter(
                user=user,
                status=InvoiceStatus.RECOVERED,
                updated_at__gte=m_start,
                updated_at__lt=m_end,
            ).aggregate(t=Sum("amount_paid"))["t"] or 0
        )
        result.append(MonthlyRevenue(
            month=m_start.strftime("%Y-%m"),
            revenue=round(rev, 2),
        ))
    return result


def get_status_breakdown(user) -> list[StatusBreakdown]:
    """Get invoice count and total by status."""
    result: list[StatusBreakdown] = []
    for status_val, status_label in InvoiceStatus.choices:
        qs = Invoice.objects.filter(user=user, status=status_val)
        count = qs.count()
        if count == 0:
            continue
        amount = float(qs.aggregate(t=Sum("amount"))["t"] or 0)
        result.append(StatusBreakdown(status=status_label, count=count, amount=round(amount, 2)))
    return result


def get_top_clients(user, limit: int = 5) -> list[TopClient]:
    """Get top clients by revenue (recovered invoices)."""
    clients = Client.objects.filter(user=user)
    client_data: list[tuple[str, float]] = []
    for c in clients:
        rev = float(
            Invoice.objects.filter(
                user=user, client=c, status=InvoiceStatus.RECOVERED,
            ).aggregate(t=Sum("amount_paid"))["t"] or 0
        )
        if rev > 0:
            client_data.append((c.name, rev))
    client_data.sort(key=lambda x: x[1], reverse=True)
    return [TopClient(client_name=name, revenue=round(rev, 2)) for name, rev in client_data[:limit]]


# ---------------------------------------------------------------------------
# Client financial profile
# ---------------------------------------------------------------------------

def get_client_financial_summary(user, client_id: str) -> ClientFinancialSummary:
    client = Client.objects.get(id=client_id, user=user)
    invoices = Invoice.objects.filter(user=user, client=client)

    total_billed = float(invoices.aggregate(t=Sum("amount"))["t"] or 0)
    total_paid = float(invoices.aggregate(t=Sum("amount_paid"))["t"] or 0)
    total_outstanding = total_billed - total_paid

    # Average days to pay (recovered only)
    recovered = invoices.filter(status=InvoiceStatus.RECOVERED)
    days_list = []
    for inv in recovered:
        if inv.payment_date:
            delta = (inv.payment_date - inv.issue_date).days
            days_list.append(max(0, delta))
    avg_days = round(sum(days_list) / len(days_list), 1) if days_list else 0.0

    # Reliability score
    total_count = invoices.exclude(status__in=[InvoiceStatus.DRAFT]).count()
    recovered_count = recovered.count()
    if total_count == 0:
        score = "N/A"
    else:
        rate = recovered_count / total_count
        if rate >= 0.9 and avg_days <= 15:
            score = "Excellent"
        elif rate >= 0.7:
            score = "Good"
        else:
            score = "Unreliable"

    return ClientFinancialSummary(
        client_id=str(client.id),
        client_name=client.name,
        total_billed=round(total_billed, 2),
        total_paid=round(total_paid, 2),
        total_outstanding=round(total_outstanding, 2),
        avg_days_to_pay=avg_days,
        reliability_score=score,
        invoice_count=invoices.count(),
    )


# ---------------------------------------------------------------------------
# Invoice scanner (LLM vision)
# ---------------------------------------------------------------------------

def _extract_text_from_pdf(file_data: bytes) -> str:
    """Extract text content from a PDF using pdfplumber."""
    import pdfplumber

    text_parts: list[str] = []
    with pdfplumber.open(io.BytesIO(file_data)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text_parts.append(page_text)

            # Also extract tables if present
            tables = page.extract_tables()
            for table in tables:
                if table:
                    for row in table:
                        if row:
                            text_parts.append(" | ".join(str(cell or "") for cell in row))

    return "\n".join(text_parts).strip()


_SCAN_FIELDS_PROMPT = """Extract all invoice details and return ONLY a JSON object with these fields:
- invoice_number (string or null)
- client_name (string or null)
- client_email (string or null)
- project_name (string or null)
- amount (number only, no currency symbols, or null)
- currency (3-letter code, default "USD")
- due_date (YYYY-MM-DD format or null)
- issue_date (YYYY-MM-DD format or null)
- status (one of: "draft", "sent", "pending", "paid", "overdue" — infer from document, or null)
- line_items (array of objects with: description, quantity, unit_price, total)
- subtotal (number or null)
- tax_amount (number or null)
- total_amount (number or null)
- notes (string or null)

If any field cannot be found, return null for that field.
Return ONLY the JSON object, no other text."""


def scan_invoice_document(file_data: bytes, content_type: str, user) -> InvoiceScanResult:
    """Extract invoice data from an uploaded document.

    For PDFs: extracts text with pdfplumber, then sends text to LLM for parsing.
    For images: sends base64 data to LLM (limited accuracy without vision support).
    """
    if content_type == "application/pdf":
        extracted_text = _extract_text_from_pdf(file_data)
        if len(extracted_text) > 50:
            message_content = (
                "You are an invoice parser. I'm providing the extracted text content "
                "from a PDF invoice document. Analyze the text carefully and extract "
                "all invoice details.\n\n"
                "--- DOCUMENT TEXT START ---\n"
                f"{extracted_text[:8000]}\n"
                "--- DOCUMENT TEXT END ---\n\n"
                f"{_SCAN_FIELDS_PROMPT}"
            )
        else:
            # PDF with no extractable text (scanned image PDF)
            b64_data = base64.b64encode(file_data).decode("utf-8")
            message_content = (
                "You are an invoice parser. I'm providing base64-encoded data from a "
                "scanned PDF document. Analyze any patterns you can detect and extract "
                f"invoice information.\n\nBase64 data:\n{b64_data[:12000]}\n\n"
                f"{_SCAN_FIELDS_PROMPT}"
            )
    else:
        # Image file
        b64_data = base64.b64encode(file_data).decode("utf-8")
        message_content = (
            f"You are an invoice parser. I'm providing a base64-encoded {content_type} "
            "image of an invoice. Analyze the encoded data to extract invoice "
            f"information.\n\nBase64 data:\n{b64_data[:12000]}\n\n"
            f"{_SCAN_FIELDS_PROMPT}"
        )

    llm_request = LLMChatRequest(
        variant=ConnectorVariant.CLAUDE_HAIKU_4_5,
        arguments=ChatCompletionRequest(
            messages=[ChatMessage(role=ChatRole.USER, content=message_content)],
            max_tokens=2000,
            temperature=0.1,
        ),
    )

    response = call_llm_chat(llm_request, user=user)
    content = response.result.content.strip()

    # Strip markdown code fences
    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])

    parsed = json.loads(content)
    return InvoiceScanResult(**parsed)


def save_scanned_document(
    user,
    file_data: bytes,
    filename: str,
    content_type: str,
    extracted_data: dict,
) -> ScannedDocument:
    """Store the original uploaded file."""
    return ScannedDocument.objects.create(
        user=user,
        original_filename=filename,
        file_data=file_data,
        content_type=content_type,
        file_size=len(file_data),
        extracted_data=extracted_data,
    )


# ---------------------------------------------------------------------------
# Payment recording
# ---------------------------------------------------------------------------

def record_payment(
    invoice: Invoice,
    amount: Decimal,
    payment_date_val: date,
    method: str = PaymentMethod.OTHER,
    notes: str = "",
) -> Payment:
    """Record a payment against an invoice and update its status."""
    payment = Payment.objects.create(
        invoice=invoice,
        amount=amount,
        payment_date=payment_date_val,
        payment_method=method,
        notes=notes,
    )

    # Update invoice
    total_paid = Payment.objects.filter(invoice=invoice).aggregate(t=Sum("amount"))["t"] or Decimal("0")
    invoice.amount_paid = total_paid
    invoice.payment_date = payment_date_val
    invoice.payment_method = method
    invoice.payment_notes = notes

    if total_paid >= invoice.amount:
        invoice.status = InvoiceStatus.RECOVERED
    elif total_paid > 0:
        invoice.status = InvoiceStatus.PARTIAL
    invoice.save(update_fields=["amount_paid", "payment_date", "payment_method", "payment_notes", "status"])
    return payment


# ---------------------------------------------------------------------------
# Financial exports
# ---------------------------------------------------------------------------

def export_invoices_csv(user, start_date: date | None = None, end_date: date | None = None) -> str:
    """Generate a CSV string of all invoices for the date range."""
    qs = Invoice.objects.filter(user=user).select_related("client").order_by("-due_date")
    if start_date:
        qs = qs.filter(due_date__gte=start_date)
    if end_date:
        qs = qs.filter(due_date__lte=end_date)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Invoice Number", "Client Name", "Client Email", "Amount", "Currency",
        "Amount Paid", "Status", "Issue Date", "Due Date", "Payment Date",
        "Payment Method", "Description", "Source", "Days Overdue",
    ])
    for inv in qs:
        writer.writerow([
            inv.invoice_number, inv.client.name, inv.client.email,
            str(inv.amount), inv.currency, str(inv.amount_paid), inv.status,
            str(inv.issue_date), str(inv.due_date),
            str(inv.payment_date) if inv.payment_date else "",
            inv.payment_method, inv.description, inv.source, inv.days_overdue,
        ])
    return output.getvalue()


def export_tax_summary(user, year: int | None = None) -> str:
    """Generate a tax summary CSV: monthly income totals for the year."""
    if year is None:
        year = date.today().year

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Month", "Income"])

    for month in range(1, 13):
        m_start = datetime(year, month, 1, tzinfo=timezone.utc)
        if month == 12:
            m_end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            m_end = datetime(year, month + 1, 1, tzinfo=timezone.utc)

        income = float(
            Invoice.objects.filter(
                user=user,
                status=InvoiceStatus.RECOVERED,
                updated_at__gte=m_start,
                updated_at__lt=m_end,
            ).aggregate(t=Sum("amount_paid"))["t"] or 0
        )
        month_label = m_start.strftime("%B %Y")
        writer.writerow([month_label, f"{income:.2f}"])

    # Total
    total = float(
        Invoice.objects.filter(
            user=user,
            status=InvoiceStatus.RECOVERED,
            updated_at__gte=datetime(year, 1, 1, tzinfo=timezone.utc),
            updated_at__lt=datetime(year + 1, 1, 1, tzinfo=timezone.utc),
        ).aggregate(t=Sum("amount_paid"))["t"] or 0
    )
    writer.writerow(["TOTAL", f"{total:.2f}"])
    return output.getvalue()


# ---------------------------------------------------------------------------
# CSV import (existing)
# ---------------------------------------------------------------------------

def _resolve_column(
    row: dict, column_mapping: dict, key: str, aliases: list[str]
) -> str:
    mapped_col = column_mapping.get(key, "")
    if mapped_col and mapped_col in row:
        return row[mapped_col].strip()
    row_lower = {k.strip().lower().replace(" ", "_").replace("-", "_"): v for k, v in row.items()}
    for alias in aliases:
        normalized = alias.strip().lower().replace(" ", "_").replace("-", "_")
        if normalized in row_lower:
            return row_lower[normalized].strip()
    return ""


def _next_invoice_number(user) -> str:
    last = (
        Invoice.objects.filter(user=user, invoice_number__startswith="INV-")
        .order_by("-invoice_number")
        .values_list("invoice_number", flat=True)
        .first()
    )
    if last:
        try:
            num = int(last.split("-")[1]) + 1
        except (IndexError, ValueError):
            num = Invoice.objects.filter(user=user).count() + 1
    else:
        num = Invoice.objects.filter(user=user).count() + 1
    return f"INV-{num:03d}"


_CLIENT_NAME_ALIASES = [
    "client_name", "client name", "name", "customer", "customer_name", "customer name",
    "company", "company_name",
]
_CLIENT_EMAIL_ALIASES = [
    "client_email", "client email", "email", "customer_email", "customer email",
    "contact_email", "contact email",
]
_INVOICE_NUMBER_ALIASES = [
    "invoice_number", "invoice number", "invoice_num", "invoice_id", "invoice #",
    "invoice", "inv_number", "inv_num", "inv_id", "number", "ref",
]
_AMOUNT_ALIASES = [
    "amount", "total", "invoice_amount", "invoice amount", "price", "cost",
    "balance", "amount_due", "amount due", "grand_total", "grand total",
]
_DUE_DATE_ALIASES = [
    "due_date", "due date", "duedate", "due", "payment_due", "payment due",
    "date_due", "date due", "deadline",
]
_RELATIONSHIP_ALIASES = [
    "relationship_tag", "relationship tag", "tag", "type", "client_type",
    "client type", "relationship", "category",
]


def import_csv(
    user, file_content: str, column_mapping: dict
) -> tuple[int, int, list[str]]:
    reader = csv.DictReader(io.StringIO(file_content))
    imported = 0
    failed = 0
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):
        result = _import_csv_row(user, row, column_mapping, i)
        if result is None:
            imported += 1
        else:
            failed += 1
            errors.append(result)

    return imported, failed, errors


def _import_csv_row(user, row: dict, column_mapping: dict, row_num: int) -> str | None:
    try:
        client_name = _resolve_column(row, column_mapping, "client_name", _CLIENT_NAME_ALIASES)
        client_email = _resolve_column(row, column_mapping, "client_email", _CLIENT_EMAIL_ALIASES)
        invoice_number = _resolve_column(row, column_mapping, "invoice_number", _INVOICE_NUMBER_ALIASES)
        amount_raw = _resolve_column(row, column_mapping, "amount", _AMOUNT_ALIASES) or "0"
        due_date_str = _resolve_column(row, column_mapping, "due_date", _DUE_DATE_ALIASES)
        relationship_tag = _resolve_column(row, column_mapping, "relationship_tag", _RELATIONSHIP_ALIASES)

        if not client_name:
            return f"Row {row_num}: Missing client name"
        if not due_date_str:
            return f"Row {row_num}: Missing due date"
        if not amount_raw or amount_raw == "0":
            return f"Row {row_num}: Missing or zero amount"

        if not invoice_number:
            invoice_number = _next_invoice_number(user)

        amount_cleaned = amount_raw.replace(",", "").replace("$", "").replace("£", "").replace("€", "")
        amount = Decimal(amount_cleaned)
        due_date_val = _parse_date(due_date_str)

        tag_lower = relationship_tag.lower() if relationship_tag else ""
        if tag_lower in ("vip", "v.i.p.", "v.i.p"):
            rel_type = "vip"
        elif tag_lower in ("repeat", "returning", "existing"):
            rel_type = "repeat"
        else:
            rel_type = "new"

        client, _ = Client.objects.get_or_create(
            user=user,
            name=client_name,
            defaults={"email": client_email, "relationship_type": rel_type},
        )
        if client_email and not client.email:
            client.email = client_email
            client.save(update_fields=["email"])

        Invoice.objects.create(
            user=user,
            client=client,
            invoice_number=invoice_number,
            amount=amount,
            due_date=due_date_val,
            issue_date=due_date_val,
            source="csv",
        )
        return None
    except InvalidOperation:
        return f"Row {row_num}: Invalid amount format '{amount_raw}'"
    except Exception as e:
        return f"Row {row_num}: {str(e)}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_reminder_prompt(input_data: ReminderGenerationInput) -> str:
    persona = STAGE_PERSONAS[input_data.stage]
    tone_note = (
        f" Adjust the tone to be slightly {input_data.tone_adjustment}."
        if input_data.tone_adjustment
        else ""
    )
    return f"""You are writing a payment reminder email on behalf of a freelancer.

Freelancer: {input_data.freelancer_name or "the freelancer"}
Business: {input_data.freelancer_business or "Freelance Services"}
Client: {input_data.client_name}
Company: {input_data.client_company or "their company"}
Invoice #: {input_data.invoice_number}
Amount: {input_data.currency} {input_data.invoice_amount:,.2f}
Days Overdue: {input_data.days_overdue}
Client Relationship: {input_data.relationship_type}

This is a Stage {input_data.stage} escalation email. The tone should be a {persona}.{tone_note}

Write a professional email with a subject line and body. The email should:
- Reference the specific invoice number and amount
- Mention how many days overdue it is
- Match the escalation stage tone exactly
- Be concise and effective (under 200 words for the body)
- NOT include placeholders like [Name] — use the actual names provided

Respond ONLY in this exact JSON format:
{{"subject": "...", "body": "..."}}"""


def _call_llm_for_reminder(prompt: str, user) -> ReminderGenerationResult:
    llm_request = LLMChatRequest(
        variant=ConnectorVariant.CLAUDE_HAIKU_4_5,
        arguments=ChatCompletionRequest(
            messages=[ChatMessage(role=ChatRole.USER, content=prompt)],
            max_tokens=1000,
            temperature=0.7,
        ),
    )
    response = call_llm_chat(llm_request, user=user)
    content = response.result.content.strip()

    if content.startswith("```"):
        lines = content.split("\n")
        content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])

    parsed = json.loads(content)
    return ReminderGenerationResult(subject=parsed["subject"], body=parsed["body"])


def _parse_date(date_str: str) -> date:
    for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%m-%d-%Y"]:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {date_str}")


def _get_or_create_profile(user) -> FreelancerProfile:
    profile, _ = FreelancerProfile.objects.get_or_create(user=user)
    return profile


def _get_default_tone(user) -> str:
    try:
        return user.escalation_rules.default_tone
    except EscalationRule.DoesNotExist:
        return DefaultTone.PROFESSIONAL


def _get_sender_email(user) -> str:
    try:
        profile = user.freelancer_profile
        if profile.email:
            return profile.email
    except FreelancerProfile.DoesNotExist:
        pass
    return user.email
