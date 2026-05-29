from __future__ import annotations

from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("clients", views.ClientViewSet, basename="client")
router.register("invoices", views.InvoiceViewSet, basename="invoice")

urlpatterns = router.urls + [
    path("reminders/<uuid:pk>/", views.ReminderEmailView.as_view(), name="reminder-detail"),
    path("reminders/<uuid:pk>/send/", views.SendReminderView.as_view(), name="reminder-send"),
    path("reminders/retry-all-failed/", views.RetryAllFailedView.as_view(), name="retry-all-failed"),
    path("dashboard/stats/", views.DashboardStatsView.as_view(), name="dashboard-stats"),
    path("financial/overview/", views.FinancialOverviewView.as_view(), name="financial-overview"),
    path("financial/client/<uuid:client_id>/", views.ClientFinancialView.as_view(), name="client-financial"),
    path("financial/export/invoices/", views.ExportInvoicesView.as_view(), name="export-invoices"),
    path("financial/export/tax-summary/", views.ExportTaxSummaryView.as_view(), name="export-tax-summary"),
    path("escalation-rules/", views.EscalationRulesView.as_view(), name="escalation-rules"),
    path("profile/", views.FreelancerProfileView.as_view(), name="freelancer-profile"),
    path("upload-csv/", views.CSVUploadView.as_view(), name="csv-upload"),
    path("scan/", views.InvoiceScanView.as_view(), name="invoice-scan"),
    path("documents/<uuid:pk>/", views.ScannedDocumentView.as_view(), name="scanned-document"),
    path("subscription/", views.SubscriptionView.as_view(), name="subscription"),
]
