from __future__ import annotations

import logging
from datetime import date

from django.core.management.base import BaseCommand

from invoices.models import (
    EscalationRule,
    FreelancerProfile,
    Invoice,
    InvoiceStatus,
    ReminderEmail,
    ReminderStatus,
    SubscriptionTier,
)
from invoices.service import generate_reminder_email, send_reminder_email

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Process auto-send escalation emails for all overdue invoices"

    def handle(self, *args: object, **options: object) -> None:
        today = date.today()
        overdue_invoices = Invoice.objects.filter(
            status__in=[InvoiceStatus.PENDING, InvoiceStatus.PARTIAL],
            due_date__lt=today,
        ).select_related("client", "user")

        processed = 0
        sent = 0
        skipped = 0

        for invoice in overdue_invoices:
            days_overdue = (today - invoice.due_date).days
            if days_overdue <= 0:
                continue

            try:
                rules = EscalationRule.objects.get(user=invoice.user)
            except EscalationRule.DoesNotExist:
                rules = EscalationRule.objects.create(user=invoice.user)

            # Check subscription tier for stage limits
            try:
                profile = FreelancerProfile.objects.get(user=invoice.user)
                tier = profile.subscription_tier
            except FreelancerProfile.DoesNotExist:
                tier = SubscriptionTier.FREE

            # Determine which stage should fire based on days overdue
            stage_thresholds = [
                (1, rules.stage_1_days, rules.auto_send_1),
                (2, rules.stage_2_days, rules.auto_send_2),
                (3, rules.stage_3_days, rules.auto_send_3),
                (4, rules.stage_4_days, rules.auto_send_4),
                (5, rules.stage_5_days, rules.auto_send_5),
            ]

            # Find the highest stage that should have been triggered
            for stage_num, threshold_days, auto_send_enabled in stage_thresholds:
                if not auto_send_enabled:
                    continue
                if days_overdue < threshold_days:
                    continue

                # Free tier can only use stages 1-2
                if tier == SubscriptionTier.FREE and stage_num > 2:
                    continue

                # Check if this stage already has a sent email
                already_sent = ReminderEmail.objects.filter(
                    invoice=invoice,
                    stage=stage_num,
                    status=ReminderStatus.SENT,
                ).exists()
                if already_sent:
                    continue

                # Generate and send
                processed += 1
                try:
                    result = generate_reminder_email(
                        invoice=invoice,
                        stage=stage_num,
                        user=invoice.user,
                    )
                    reminder = ReminderEmail.objects.create(
                        invoice=invoice,
                        stage=stage_num,
                        subject=result.subject,
                        body=result.body,
                        status=ReminderStatus.DRAFT,
                        ai_generated=True,
                    )
                    success = send_reminder_email(reminder)
                    if success:
                        sent += 1
                        logger.info(
                            "Auto-sent stage %d for invoice %s to %s",
                            stage_num, invoice.invoice_number, invoice.client.email,
                        )
                    else:
                        skipped += 1
                        logger.warning(
                            "Auto-send failed for stage %d invoice %s",
                            stage_num, invoice.invoice_number,
                        )
                except Exception:
                    skipped += 1
                    logger.exception(
                        "Error processing stage %d for invoice %s",
                        stage_num, invoice.invoice_number,
                    )

        self.stdout.write(
            f"Auto-send complete: {processed} processed, {sent} sent, {skipped} skipped"
        )
