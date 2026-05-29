from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from django.core.management.base import BaseCommand

from accounts.models import User
from invoices.models import (
    Client,
    FreelancerProfile,
    Invoice,
    InvoiceStatus,
    RelationshipType,
    SubscriptionTier,
)

logger = logging.getLogger(__name__)

DEMO_CUSTOMERS = [
    {
        "name": "Alex Rivera",
        "email": "alex.rivera@example.com",
        "company": "Rivera Digital",
        "relationship_type": RelationshipType.VIP,
        "subscription_tier": SubscriptionTier.PRO,
        "total_amount": Decimal("34500.00"),
        "invoice_count": 8,
        "days_ago": 30,
    },
    {
        "name": "Sam Chen",
        "email": "sam.chen@example.com",
        "company": "Chen Creative",
        "relationship_type": RelationshipType.NEW,
        "subscription_tier": SubscriptionTier.FREE,
        "total_amount": Decimal("6200.00"),
        "invoice_count": 2,
        "days_ago": 15,
    },
    {
        "name": "Maya Patel",
        "email": "maya.patel@example.com",
        "company": "Patel & Associates",
        "relationship_type": RelationshipType.VIP,
        "subscription_tier": SubscriptionTier.SHIELD_PLUS,
        "total_amount": Decimal("67800.00"),
        "invoice_count": 12,
        "days_ago": 45,
    },
]


def _get_or_create_demo_owner() -> User:
    """Get the first existing user, or create a demo owner."""
    user = User.objects.first()
    if user is not None:
        return user
    return User.objects.create_user(
        email="demo@payflow.app",
        first_name="Demo",
        last_name="Admin",
    )


def _create_invoices_for_client(
    user: User,
    client: Client,
    total_amount: Decimal,
    invoice_count: int,
    base_date: date,
) -> list[Invoice]:
    """Create invoices that sum to total_amount for a client."""
    invoices: list[Invoice] = []
    base_amount = (total_amount / invoice_count).quantize(Decimal("0.01"))
    remainder = total_amount - (base_amount * invoice_count)

    statuses = [
        InvoiceStatus.RECOVERED,
        InvoiceStatus.PENDING,
        InvoiceStatus.OVERDUE,
        InvoiceStatus.SENT,
        InvoiceStatus.PARTIAL,
    ]

    for i in range(invoice_count):
        amount = base_amount + (remainder if i == 0 else Decimal("0"))
        issue_date = base_date + timedelta(days=i * 3)
        due_date = issue_date + timedelta(days=30)
        status = statuses[i % len(statuses)]

        amount_paid = Decimal("0")
        payment_date = None
        if status == InvoiceStatus.RECOVERED:
            amount_paid = amount
            payment_date = due_date - timedelta(days=5)
        elif status == InvoiceStatus.PARTIAL:
            amount_paid = (amount / 2).quantize(Decimal("0.01"))

        invoice = Invoice(
            user=user,
            client=client,
            invoice_number=f"INV-{client.name.split()[0].upper()[:3]}-{i + 1:03d}",
            amount=amount,
            issue_date=issue_date,
            due_date=due_date,
            status=status,
            amount_paid=amount_paid,
            payment_date=payment_date,
            description=f"Project work for {client.company or client.name}",
        )
        invoices.append(invoice)

    return Invoice.objects.bulk_create(invoices)


class Command(BaseCommand):
    help = "Seed 3 demo customers with invoices for the Customers dashboard"

    def handle(self, *args: object, **options: object) -> None:
        owner = _get_or_create_demo_owner()
        self.stdout.write(f"Using owner: {owner.email}")
        today = date.today()

        for customer_data in DEMO_CUSTOMERS:
            created_date = today - timedelta(days=customer_data["days_ago"])

            client, created = Client.objects.get_or_create(
                user=owner,
                email=customer_data["email"],
                defaults={
                    "name": customer_data["name"],
                    "company": customer_data["company"],
                    "relationship_type": customer_data["relationship_type"],
                    "notes": f"Subscription: {customer_data['subscription_tier'].label}",
                },
            )

            if not created:
                self.stdout.write(f"  Client '{client.name}' already exists, skipping.")
                continue

            # Backdate the created_at timestamp
            aware_date = timezone.make_aware(
                timezone.datetime.combine(created_date, timezone.datetime.min.time())
            )
            Client.objects.filter(pk=client.pk).update(created_at=aware_date)

            invoices = _create_invoices_for_client(
                user=owner,
                client=client,
                total_amount=customer_data["total_amount"],
                invoice_count=customer_data["invoice_count"],
                base_date=created_date,
            )

            self.stdout.write(
                self.style.SUCCESS(
                    f"  Created client '{client.name}' "
                    f"({customer_data['subscription_tier'].label}) "
                    f"with {len(invoices)} invoices "
                    f"totaling ${customer_data['total_amount']:,.2f}"
                )
            )

        self.stdout.write(self.style.SUCCESS("Demo customer seeding complete."))
