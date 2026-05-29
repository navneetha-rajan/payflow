from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal, InvalidOperation

from django.http import HttpResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from connectors.connector_llm import ConnectorAPIError

from . import service
from .models import (
    Client,
    EscalationRule,
    FreelancerProfile,
    Invoice,
    Payment,
    ReminderEmail,
    ScannedDocument,
    SubscriptionTier,
)
from .serializers import (
    ClientSerializer,
    EscalationRuleSerializer,
    FreelancerProfileSerializer,
    InvoiceSerializer,
    PaymentSerializer,
    ReminderEmailSerializer,
    ScannedDocumentSerializer,
)

logger = logging.getLogger(__name__)


class ClientViewSet(viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = ClientSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return self.request.user.clients.all()

    def perform_create(self, serializer: ClientSerializer) -> None:
        serializer.save(user=self.request.user)


class InvoiceViewSet(viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = self.request.user.invoices.select_related("client").prefetch_related("reminders", "payments")
        status_filter = self.request.query_params.get("status")
        client_id = self.request.query_params.get("client_id")
        overdue_only = self.request.query_params.get("overdue_only")

        if status_filter:
            qs = qs.filter(status=status_filter)
        if client_id:
            qs = qs.filter(client_id=client_id)
        if overdue_only == "true":
            qs = qs.filter(due_date__lt=date.today(), status__in=["pending", "partial", "overdue"])

        return qs

    def perform_create(self, serializer: InvoiceSerializer) -> None:
        profile, _ = FreelancerProfile.objects.get_or_create(user=self.request.user)
        if profile.subscription_tier == SubscriptionTier.FREE:
            current_count = Invoice.objects.filter(user=self.request.user).count()
            if current_count >= 2:
                from rest_framework.exceptions import PermissionDenied

                raise PermissionDenied(
                    "Free tier limited to 2 invoices. Upgrade to Pro for unlimited."
                )
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="generate-reminder")
    def generate_reminder(self, request: Request, pk: str | None = None) -> Response:
        invoice = self.get_object()
        stage = request.data.get("stage", 1)
        tone_adjustment = request.data.get("tone_adjustment")

        try:
            stage = int(stage)
        except (ValueError, TypeError):
            return Response(
                {"error": "Stage must be an integer between 1 and 5"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if stage not in range(1, 6):
            return Response(
                {"error": "Stage must be between 1 and 5"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile, _ = FreelancerProfile.objects.get_or_create(user=request.user)
        if profile.subscription_tier == SubscriptionTier.FREE and stage > 2:
            return Response(
                {"error": "Free tier limited to Stage 1-2. Upgrade to Pro for all 5 stages."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            result = service.generate_reminder_email(invoice, stage, request.user, tone_adjustment)
        except ConnectorAPIError as e:
            return Response({"error": str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        reminder = ReminderEmail.objects.create(
            invoice=invoice,
            stage=stage,
            subject=result.subject,
            body=result.body,
            ai_generated=True,
        )
        return Response(ReminderEmailSerializer(reminder).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request: Request, pk: str | None = None) -> Response:
        invoice = self.get_object()
        payment_method = request.data.get("payment_method", "other")
        payment_notes = request.data.get("notes", "")
        payment_date_str = request.data.get("payment_date")
        payment_date_val = date.today()
        if payment_date_str:
            try:
                payment_date_val = date.fromisoformat(payment_date_str)
            except ValueError:
                pass

        service.record_payment(
            invoice=invoice,
            amount=invoice.amount - invoice.amount_paid,
            payment_date_val=payment_date_val,
            method=payment_method,
            notes=payment_notes,
        )
        invoice.refresh_from_db()
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=["post"], url_path="mark-partial")
    def mark_partial(self, request: Request, pk: str | None = None) -> Response:
        invoice = self.get_object()
        amount_paid = request.data.get("amount_paid", 0)
        payment_method = request.data.get("payment_method", "other")
        payment_notes = request.data.get("notes", "")
        payment_date_str = request.data.get("payment_date")
        payment_date_val = date.today()
        if payment_date_str:
            try:
                payment_date_val = date.fromisoformat(payment_date_str)
            except ValueError:
                pass

        try:
            amount = Decimal(str(amount_paid))
        except (InvalidOperation, ValueError):
            return Response({"error": "Invalid amount"}, status=status.HTTP_400_BAD_REQUEST)

        service.record_payment(
            invoice=invoice,
            amount=amount,
            payment_date_val=payment_date_val,
            method=payment_method,
            notes=payment_notes,
        )
        invoice.refresh_from_db()
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=["get"], url_path="reminders")
    def get_reminders(self, request: Request, pk: str | None = None) -> Response:
        invoice = self.get_object()
        reminders = invoice.reminders.all()
        return Response(ReminderEmailSerializer(reminders, many=True).data)

    @action(detail=True, methods=["get"], url_path="payments")
    def get_payments(self, request: Request, pk: str | None = None) -> Response:
        invoice = self.get_object()
        payments = invoice.payments.all()
        return Response(PaymentSerializer(payments, many=True).data)

    @action(detail=True, methods=["post"], url_path="mark-disputed")
    def mark_disputed(self, request: Request, pk: str | None = None) -> Response:
        invoice = self.get_object()
        invoice.status = "disputed"
        invoice.save(update_fields=["status"])
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=["post"], url_path="write-off")
    def write_off(self, request: Request, pk: str | None = None) -> Response:
        invoice = self.get_object()
        invoice.status = "written_off"
        invoice.save(update_fields=["status"])
        return Response(InvoiceSerializer(invoice).data)


class ReminderEmailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_reminder(self, pk: str, user) -> ReminderEmail | None:
        try:
            reminder = ReminderEmail.objects.select_related("invoice__user").get(pk=pk)
            if reminder.invoice.user_id != user.id:
                return None
            return reminder
        except ReminderEmail.DoesNotExist:
            return None

    def get(self, request: Request, pk: str) -> Response:
        reminder = self._get_reminder(pk, request.user)
        if not reminder:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(ReminderEmailSerializer(reminder).data)

    def patch(self, request: Request, pk: str) -> Response:
        reminder = self._get_reminder(pk, request.user)
        if not reminder:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        if reminder.status == "sent":
            return Response(
                {"error": "Cannot edit a sent email"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = ReminderEmailSerializer(reminder, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SendReminderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request, pk: str) -> Response:
        try:
            reminder = ReminderEmail.objects.select_related(
                "invoice__user", "invoice__client"
            ).get(pk=pk)
        except ReminderEmail.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        if reminder.invoice.user_id != request.user.id:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        if reminder.status == "sent":
            return Response({"error": "Already sent"}, status=status.HTTP_400_BAD_REQUEST)

        success = service.send_reminder_email(reminder)
        if not success:
            reminder.refresh_from_db()
            return Response(
                {"error": f"Failed to send email (status: {reminder.status}). Check client email address."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        reminder.refresh_from_db()
        return Response(ReminderEmailSerializer(reminder).data)


class RetryAllFailedView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        failed_reminders = ReminderEmail.objects.filter(
            invoice__user=request.user,
            status__in=["failed", "paused"],
        ).select_related("invoice__client", "invoice__user")

        sent = 0
        still_failed = 0
        for reminder in failed_reminders:
            success = service.send_reminder_email(reminder)
            if success:
                sent += 1
            else:
                still_failed += 1

        return Response({
            "sent": sent,
            "still_failed": still_failed,
            "total_attempted": sent + still_failed,
        })


class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        try:
            stats = service.get_dashboard_stats(request.user)
            return Response(stats.model_dump())
        except Exception:
            logger.exception("Dashboard stats failed")
            return Response({
                "total_overdue_amount": 0,
                "total_overdue_count": 0,
                "avg_days_overdue": 0,
                "recovery_rate": 0,
                "recovered_this_month": 0,
            })


class FinancialOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        try:
            overview = service.get_financial_overview(request.user)
            monthly = service.get_monthly_revenue(request.user)
            breakdown = service.get_status_breakdown(request.user)
            top_clients = service.get_top_clients(request.user)
            return Response({
                "overview": overview.model_dump(),
                "monthly_revenue": [m.model_dump() for m in monthly],
                "status_breakdown": [s.model_dump() for s in breakdown],
                "top_clients": [c.model_dump() for c in top_clients],
            })
        except Exception:
            logger.exception("Financial overview failed")
            return Response({
                "overview": {
                    "revenue_this_month": 0, "revenue_last_month": 0,
                    "revenue_change_pct": 0, "revenue_this_year": 0,
                    "outstanding_amount": 0, "outstanding_count": 0,
                    "overdue_amount": 0, "overdue_count": 0,
                    "recovered_this_month": 0, "paid_on_time_rate": 0,
                    "avg_days_to_payment": 0, "total_overdue_amount": 0,
                    "total_overdue_count": 0, "avg_days_overdue": 0,
                    "recovery_rate": 0,
                },
                "monthly_revenue": [],
                "status_breakdown": [],
                "top_clients": [],
            })


class ClientFinancialView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request, client_id: str) -> Response:
        try:
            summary = service.get_client_financial_summary(request.user, client_id)
            invoices = Invoice.objects.filter(
                user=request.user, client_id=client_id
            ).select_related("client").prefetch_related("payments").order_by("-due_date")
            return Response({
                "summary": summary.model_dump(),
                "invoices": InvoiceSerializer(invoices, many=True).data,
            })
        except Client.DoesNotExist:
            return Response({"error": "Client not found"}, status=status.HTTP_404_NOT_FOUND)
        except Exception:
            logger.exception("Client financial view failed")
            return Response({"error": "Failed to load client data"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class EscalationRulesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        rules, _ = EscalationRule.objects.get_or_create(user=request.user)
        return Response(EscalationRuleSerializer(rules).data)

    def put(self, request: Request) -> Response:
        rules, _ = EscalationRule.objects.get_or_create(user=request.user)
        serializer = EscalationRuleSerializer(rules, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class FreelancerProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        profile, _ = FreelancerProfile.objects.get_or_create(user=request.user)
        return Response(FreelancerProfileSerializer(profile).data)

    def put(self, request: Request) -> Response:
        profile, _ = FreelancerProfile.objects.get_or_create(user=request.user)
        serializer = FreelancerProfileSerializer(profile, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CSVUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

        column_mapping = {
            "client_name": request.data.get("col_client_name", "Client Name"),
            "client_email": request.data.get("col_client_email", "Client Email"),
            "invoice_number": request.data.get("col_invoice_number", "Invoice Number"),
            "amount": request.data.get("col_amount", "Amount"),
            "due_date": request.data.get("col_due_date", "Due Date"),
        }

        try:
            content = file.read().decode("utf-8")
        except UnicodeDecodeError:
            return Response(
                {"error": "File must be UTF-8 encoded"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile, _ = FreelancerProfile.objects.get_or_create(user=request.user)
        if profile.subscription_tier == SubscriptionTier.FREE:
            current_count = Invoice.objects.filter(user=request.user).count()
            if current_count >= 2:
                return Response(
                    {"error": "Free tier limited to 2 invoices. Upgrade to Pro for unlimited."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        imported, failed, errors = service.import_csv(request.user, content, column_mapping)
        return Response({
            "rows_imported": imported,
            "rows_failed": failed,
            "errors": errors[:20],
        })


class InvoiceScanView(APIView):
    """Upload a document (PDF/image) and extract invoice data via LLM vision."""

    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

        allowed_types = [
            "application/pdf", "image/jpeg", "image/jpg", "image/png",
            "image/webp", "image/gif",
        ]
        content_type = file.content_type or "application/octet-stream"
        if content_type not in allowed_types:
            return Response(
                {"error": f"Unsupported file type: {content_type}. Accepted: PDF, JPG, PNG, WEBP"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_data = file.read()
        if len(file_data) > 10 * 1024 * 1024:
            return Response(
                {"error": "File too large. Maximum 10MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            scan_result = service.scan_invoice_document(file_data, content_type, request.user)
        except ConnectorAPIError as e:
            return Response({"error": f"AI processing failed: {e}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            logger.exception("Invoice scan failed")
            return Response({"error": f"Failed to process document: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Store the document
        doc = service.save_scanned_document(
            user=request.user,
            file_data=file_data,
            filename=file.name or "unknown",
            content_type=content_type,
            extracted_data=scan_result.model_dump(),
        )

        return Response({
            "document_id": str(doc.id),
            "extracted": scan_result.model_dump(),
        }, status=status.HTTP_201_CREATED)


class ScannedDocumentView(APIView):
    """View original scanned document."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request, pk: str) -> Response:
        try:
            doc = ScannedDocument.objects.get(pk=pk, user=request.user)
        except ScannedDocument.DoesNotExist:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

        response = HttpResponse(doc.file_data, content_type=doc.content_type)
        response["Content-Disposition"] = f'inline; filename="{doc.original_filename}"'
        return response


class SubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        profile, _ = FreelancerProfile.objects.get_or_create(user=request.user)
        return Response({
            "tier": profile.subscription_tier,
            "stripe_customer_id": profile.stripe_customer_id or None,
        })

    def post(self, request: Request) -> Response:
        tier = request.data.get("tier")
        if tier not in [choice[0] for choice in SubscriptionTier.choices]:
            return Response(
                {"error": f"Invalid tier: {tier}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile, _ = FreelancerProfile.objects.get_or_create(user=request.user)
        profile.subscription_tier = tier
        profile.save(update_fields=["subscription_tier"])
        return Response({"tier": profile.subscription_tier})


class ExportInvoicesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> HttpResponse:
        start = request.query_params.get("start_date")
        end = request.query_params.get("end_date")
        start_date = date.fromisoformat(start) if start else None
        end_date = date.fromisoformat(end) if end else None

        csv_content = service.export_invoices_csv(request.user, start_date, end_date)
        response = HttpResponse(csv_content, content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="payflow_invoices.csv"'
        return response


class ExportTaxSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> HttpResponse:
        year_str = request.query_params.get("year")
        year = int(year_str) if year_str else None

        csv_content = service.export_tax_summary(request.user, year)
        response = HttpResponse(csv_content, content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="payflow_tax_summary_{year or date.today().year}.csv"'
        return response
