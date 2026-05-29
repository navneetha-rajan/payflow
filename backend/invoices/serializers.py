from __future__ import annotations

from rest_framework import serializers

from .models import Client, EscalationRule, FreelancerProfile, Invoice, Payment, ReminderEmail, ScannedDocument


class ClientSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = Client
        fields = [
            "id",
            "name",
            "email",
            "company",
            "relationship_type",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class PaymentSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = Payment
        fields = [
            "id",
            "invoice",
            "amount",
            "payment_date",
            "payment_method",
            "notes",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class ScannedDocumentSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = ScannedDocument
        fields = [
            "id",
            "original_filename",
            "content_type",
            "file_size",
            "extracted_data",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class InvoiceSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    client = ClientSerializer(read_only=True)
    client_id = serializers.UUIDField(write_only=True)
    days_overdue = serializers.IntegerField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    remaining_balance = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    reminders_sent = serializers.SerializerMethodField()
    last_reminder_stage = serializers.SerializerMethodField()
    payments = PaymentSerializer(many=True, read_only=True)
    has_document = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id",
            "client",
            "client_id",
            "invoice_number",
            "amount",
            "currency",
            "issue_date",
            "due_date",
            "status",
            "amount_paid",
            "description",
            "source",
            "line_items",
            "subtotal",
            "tax_amount",
            "notes",
            "payment_date",
            "payment_method",
            "payment_notes",
            "days_overdue",
            "is_overdue",
            "remaining_balance",
            "reminders_sent",
            "last_reminder_stage",
            "payments",
            "has_document",
            "scanned_document_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_reminders_sent(self, obj: Invoice) -> int:
        return obj.reminders.filter(status="sent").count()

    def get_last_reminder_stage(self, obj: Invoice) -> int | None:
        last = obj.reminders.filter(status="sent").order_by("-stage").first()
        return last.stage if last else None

    def get_has_document(self, obj: Invoice) -> bool:
        return obj.scanned_document_id is not None

    def create(self, validated_data: dict) -> Invoice:
        client_id = validated_data.pop("client_id")
        validated_data["client_id"] = client_id
        return super().create(validated_data)

    def update(self, instance: Invoice, validated_data: dict) -> Invoice:
        client_id = validated_data.pop("client_id", None)
        if client_id is not None:
            validated_data["client_id"] = client_id
        return super().update(instance, validated_data)


class ReminderEmailSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = ReminderEmail
        fields = [
            "id",
            "invoice",
            "stage",
            "subject",
            "body",
            "status",
            "sent_at",
            "ai_generated",
            "recipient_email",
            "email_message_id",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "invoice",
            "stage",
            "status",
            "sent_at",
            "ai_generated",
            "recipient_email",
            "email_message_id",
            "created_at",
            "updated_at",
        ]


class EscalationRuleSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = EscalationRule
        fields = [
            "stage_1_days",
            "stage_2_days",
            "stage_3_days",
            "stage_4_days",
            "stage_5_days",
            "auto_send_1",
            "auto_send_2",
            "auto_send_3",
            "auto_send_4",
            "auto_send_5",
            "default_tone",
        ]


class FreelancerProfileSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = FreelancerProfile
        fields = ["display_name", "business_name", "email", "subscription_tier"]
        read_only_fields = ["subscription_tier"]
