"""
Billing-error middleware for Vector-generated apps.

Reads a contextvars flag set by the connector SDK when the Vector API
returns a 402 (owner insufficient credits) and propagates it as an
X-Vector-Billing-Error response header. The bridge script in the
iframe reads this header and notifies the parent app builder.
"""


class VectorBillingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            from connectors.connector_llm import clear_vector_billing_error, get_vector_billing_error
        except ImportError:
            return self.get_response(request)

        clear_vector_billing_error()

        response = self.get_response(request)

        billing_error = get_vector_billing_error()
        if billing_error:
            response["X-Vector-Billing-Error"] = billing_error
            clear_vector_billing_error()

        return response
