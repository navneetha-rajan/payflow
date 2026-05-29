from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.conf import settings
from django.db import models

from shared.models import BaseModel


class RelationshipType(models.TextChoices):
    NEW = "new", "New"
    REPEAT = "repeat", "Repeat"
    VIP = "vip", "VIP"


class InvoiceStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SENT = "sent", "Sent"
    PENDING = "pending", "Pending"
    PARTIAL = "partial", "Partially Paid"
    RECOVERED = "recovered", "Recovered"
    OVERDUE = "overdue", "Overdue"
    WRITTEN_OFF = "written_off", "Written Off"
    DISPUTED = "disputed", "Disputed"


class InvoiceSource(models.TextChoices):
    MANUAL = "manual", "Manual"
    CSV = "csv", "CSV Upload"
    SCAN = "scan", "Document Scan"


class PaymentMethod(models.TextChoices):
    BANK_TRANSFER = "bank_transfer", "Bank Transfer"
    PAYPAL = "paypal", "PayPal"
    STRIPE = "stripe", "Stripe"
    CASH = "cash", "Cash"
    CHEQUE = "cheque", "Cheque"
    OTHER = "other", "Other"


class ReminderStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"
    PAUSED = "paused", "Paused"


class DefaultTone(models.TextChoices):
    PROFESSIONAL = "professional", "Professional"
    FRIENDLY = "friendly", "Friendly"
    FIRM = "firm", "Firm"


class SubscriptionTier(models.TextChoices):
    FREE = "free", "Free"
    PRO = "pro", "Pro"
    SHIELD_PLUS = "shield_plus", "Shield+"


class Client(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="clients",
    )
    name = models.CharField(max_length=255)
    email = models.EmailField()
    company = models.CharField(max_length=255, blank=True)
    relationship_type = models.CharField(
        max_length=20,
        choices=RelationshipType.choices,
        default=RelationshipType.NEW,
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class Invoice(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invoices",
    )
    client = models.ForeignKey(Client, on_delete=models.PROTECT, related_name="invoices")
    invoice_number = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    issue_date = models.DateField()
    due_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=InvoiceStatus.choices,
        default=InvoiceStatus.PENDING,
    )
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    description = models.TextField(blank=True)
    source = models.CharField(
        max_length=20,
        choices=InvoiceSource.choices,
        default=InvoiceSource.MANUAL,
    )
    # Line items stored as JSON: [{description, quantity, unit_price, total}]
    line_items = models.JSONField(default=list, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)
    # Link to scanned document
    scanned_document = models.ForeignKey(
        "ScannedDocument",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoices",
    )
    payment_date = models.DateField(null=True, blank=True)
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        blank=True,
    )
    payment_notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-due_date"]

    def __str__(self) -> str:
        return f"{self.invoice_number} - {self.client.name}"

    @property
    def days_overdue(self) -> int:
        if self.due_date >= date.today():
            return 0
        return (date.today() - self.due_date).days

    @property
    def is_overdue(self) -> bool:
        return self.days_overdue > 0 and self.status in [
            InvoiceStatus.PENDING,
            InvoiceStatus.PARTIAL,
            InvoiceStatus.OVERDUE,
        ]

    @property
    def remaining_balance(self) -> Decimal:
        return self.amount - self.amount_paid


class ScannedDocument(BaseModel):
    """Stores original uploaded files (PDF/images) alongside extracted invoice data."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="scanned_documents",
    )
    original_filename = models.CharField(max_length=500)
    file_data = models.BinaryField()
    content_type = models.CharField(max_length=100)
    file_size = models.IntegerField(default=0)
    extracted_data = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.original_filename


class Payment(BaseModel):
    """Individual payment record for tracking partial and full payments."""

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_date = models.DateField()
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.OTHER,
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-payment_date"]

    def __str__(self) -> str:
        return f"${self.amount} on {self.payment_date} for {self.invoice}"


class EscalationRule(BaseModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="escalation_rules",
    )
    stage_1_days = models.IntegerField(default=1)
    stage_2_days = models.IntegerField(default=8)
    stage_3_days = models.IntegerField(default=15)
    stage_4_days = models.IntegerField(default=22)
    stage_5_days = models.IntegerField(default=30)
    auto_send_1 = models.BooleanField(default=False)
    auto_send_2 = models.BooleanField(default=False)
    auto_send_3 = models.BooleanField(default=False)
    auto_send_4 = models.BooleanField(default=False)
    auto_send_5 = models.BooleanField(default=False)
    default_tone = models.CharField(
        max_length=20,
        choices=DefaultTone.choices,
        default=DefaultTone.PROFESSIONAL,
    )

    def __str__(self) -> str:
        return f"Escalation Rules for {self.user}"


class FreelancerProfile(BaseModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="freelancer_profile",
    )
    display_name = models.CharField(max_length=255, blank=True)
    business_name = models.CharField(max_length=255, blank=True)
    email = models.EmailField(blank=True)
    subscription_tier = models.CharField(
        max_length=20,
        choices=SubscriptionTier.choices,
        default=SubscriptionTier.FREE,
    )
    stripe_customer_id = models.CharField(max_length=255, blank=True)
    stripe_subscription_id = models.CharField(max_length=255, blank=True)

    def __str__(self) -> str:
        return f"Profile for {self.user}"


class ReminderEmail(BaseModel):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="reminders")
    stage = models.IntegerField(choices=[(i, f"Stage {i}") for i in range(1, 6)])
    subject = models.CharField(max_length=500)
    body = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=ReminderStatus.choices,
        default=ReminderStatus.DRAFT,
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    ai_generated = models.BooleanField(default=True)
    recipient_email = models.EmailField(blank=True)
    email_message_id = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Stage {self.stage} reminder for {self.invoice}"


class CSVUpload(BaseModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="csv_uploads",
    )
    rows_imported = models.IntegerField(default=0)
    rows_failed = models.IntegerField(default=0)
    error_log = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"CSV Upload by {self.user} at {self.created_at}"
