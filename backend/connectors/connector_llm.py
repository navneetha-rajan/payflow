"""
Vector LLM Connector SDK — AUTO-GENERATED, DO NOT EDIT.
"""

import contextvars
import os
from enum import StrEnum
from typing import Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field


_vector_billing_error: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "_vector_billing_error", default=None
)


def get_vector_billing_error() -> str | None:
    """Return the current billing error flag, or None."""
    return _vector_billing_error.get(None)


def clear_vector_billing_error() -> None:
    """Reset the billing error flag."""
    _vector_billing_error.set(None)


class ConnectorTool(StrEnum):
    LLM_CHAT = "llm.chat"


class ConnectorVariant(StrEnum):
    CLAUDE_OPUS_4_6 = "claude-opus-4.6"
    CLAUDE_SONNET_4_6 = "claude-sonnet-4.6"
    CLAUDE_HAIKU_4_5 = "claude-haiku-4.5"
    GPT_5_2 = "gpt-5.2"
    GPT_5_MINI = "gpt-5-mini"
    GPT_5_NANO = "gpt-5-nano"
    GEMINI_3_1_PRO = "gemini-3.1-pro"
    GEMINI_3_FLASH = "gemini-3-flash"


class ChatRole(StrEnum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"



class ConnectorExecuteRequest(BaseModel):
    tool: ConnectorTool = Field(description="Connector tool to invoke (e.g. 'llm.chat').")
    variant: ConnectorVariant | None = Field(
        default=None,
        description="Model or provider variant. Uses the connector's default if omitted.",
    )
    arguments: dict = Field(
        description="Tool-specific arguments validated against the tool's input schema."
    )



class ConnectorExecuteResponse(BaseModel):
    tool: str = Field(description="The tool that was executed.")
    variant: str | None = Field(
        default=None, description="The variant that was used, if applicable."
    )
    result: dict = Field(description="Tool-specific result payload.")



class ChatMessage(BaseModel):
    """A single message in a chat conversation."""

    role: ChatRole = Field(
        description="The role of the message author: 'system', 'user', or 'assistant'."
    )
    content: str = Field(
        ...,
        min_length=1,
        description="The text content of the message.",
    )



class JsonSchemaResponseFormat(BaseModel):
    """JSON schema response format for structured output."""

    type: Literal["json_schema"] = Field(
        default="json_schema", description="Must be 'json_schema'."
    )
    json_schema: dict = Field(description="The JSON Schema the model's output must conform to.")



class JsonObjectResponseFormat(BaseModel):
    """JSON object response format."""

    type: Literal["json_object"] = Field(
        default="json_object", description="Must be 'json_object'."
    )



class ChatCompletionRequest(BaseModel):
    """Input schema for llm.chat."""

    messages: list[ChatMessage] = Field(
        ...,
        min_length=1,
        description="The conversation messages. Must contain at least one message.",
    )
    max_tokens: int | None = Field(
        default=None, ge=1, description="Maximum number of tokens to generate."
    )
    temperature: float | None = Field(
        default=None, ge=0.0, le=2.0, description="Sampling temperature between 0.0 and 2.0."
    )
    response_format: JsonSchemaResponseFormat | JsonObjectResponseFormat | None = Field(
        default=None, description="Constrain the model's output format to JSON."
    )



class LLMChatRequest(ConnectorExecuteRequest):
    """Typed request for llm.chat — narrows arguments to ChatCompletionRequest."""

    tool: Literal["llm.chat"] = Field(default="llm.chat", description="Must be 'llm.chat'.")
    variant: ConnectorVariant = Field(description="Model or provider variant.")
    arguments: ChatCompletionRequest = Field(description="Chat completion parameters.")



class ChatCompletionUsage(BaseModel):
    """Token usage breakdown from the provider."""

    prompt_tokens: int = Field(default=0, ge=0, description="Number of tokens in the prompt.")
    completion_tokens: int = Field(
        default=0, ge=0, description="Number of tokens in the completion."
    )
    total_tokens: int = Field(
        default=0, ge=0, description="Total tokens used (prompt + completion)."
    )
    cost: float = Field(
        default=0,
        ge=0,
        exclude=True,
        description="Provider cost in USD (internal only, excluded from output).",
    )



class ChatCompletionResponse(BaseModel):
    """Output schema for llm.chat."""

    content: str = Field(description="The model's text response.")
    model: str = Field(
        description="The model that generated the response (e.g. 'anthropic/claude-sonnet-4.6')."
    )
    usage: ChatCompletionUsage = Field(description="Token usage breakdown.")
    finish_reason: str = Field(
        default="stop", description="Why the model stopped generating: 'stop', 'length', etc."
    )



class LLMChatResponse(ConnectorExecuteResponse):
    """Typed response from llm.chat — narrows result to ChatCompletionResponse."""

    result: ChatCompletionResponse = Field(description="Chat completion result.")



class ConnectorErrorResponse(BaseModel):
    """Top-level error response."""

    error: str = Field(description="Human-readable error message.")
    error_type: str = Field(
        description="Machine-readable error category (e.g. 'ConnectorValidationError')."
    )
    details: list[dict] | None = Field(
        default=None, description="Pydantic validation error details, if applicable."
    )



VECTOR_API_URL = os.getenv('VECTOR_API_URL', 'http://localhost:8001')
VECTOR_APP_ID = os.getenv('VECTOR_APP_ID', '')
VECTOR_API_TOKEN = os.getenv('VECTOR_API_TOKEN', '')
VECTOR_ORIGIN = os.getenv('VECTOR_ORIGIN', '')
CONNECTOR_EXECUTE_PATH = '/api/vector/connector-execute/'


class _SystemCall:
    """Sentinel indicating costs should be attributed to the system, not a user."""
    pass


SYSTEM_CALL = _SystemCall()
"""Use as the `user` argument when the call is not on behalf of a specific user.
Costs will be attributed to the system (app-level shared pool) instead of an
individual end user."""


def _build_auth_headers(user) -> dict[str, str]:
    """Build auth headers for Vector API calls.

    Args:
        user: User instance with a 'vector_uga_user_id' attribute,
              or SYSTEM_CALL if costs should not be attributed to a user.
    """
    headers: dict[str, str] = {}
    if VECTOR_APP_ID:
        headers['X-Vector-App-Id'] = VECTOR_APP_ID
    if VECTOR_API_TOKEN:
        headers['X-UGA-Api-Token'] = VECTOR_API_TOKEN
    if VECTOR_ORIGIN:
        headers['X-Vector-Origin'] = VECTOR_ORIGIN
    if not isinstance(user, _SystemCall) and user and getattr(user, 'vector_uga_user_id', None):
        headers['X-Vector-UGA-User-Id'] = user.vector_uga_user_id
    return headers


class ConnectorAPIError(Exception):
    """Raised when the connector API returns an error."""

    def __init__(self, status_code, error, error_type, details=None):
        self.status_code = status_code
        self.error = error
        self.error_type = error_type
        self.details = details
        super().__init__(f"{error_type}: {error}")


def call_llm_chat(request: LLMChatRequest, *, user) -> LLMChatResponse:
    """Call the llm.chat connector tool.

    Args:
        request: Typed LLMChatRequest envelope.
        user: The user making this request. Pass request.user from views,
              or a User loaded from DB in background tasks. Costs are
              attributed to this user. Use SYSTEM_CALL if costs should
              not be attributed to a user.

    Raises:
        ConnectorAPIError: When the API returns a structured error response.
        httpx.HTTPStatusError: When the API returns an unparseable error.
    """
    url = VECTOR_API_URL.rstrip('/') + CONNECTOR_EXECUTE_PATH
    resp = httpx.post(
        url,
        json=request.model_dump(exclude_none=True),
        headers=_build_auth_headers(user),
        timeout=120.0,
    )
    if resp.status_code >= 400:
        if resp.status_code == 402:
            try:
                body = resp.json()
                if body.get("reason") == "insufficient_credits" and body.get("entity") == "owner":
                    _vector_billing_error.set("owner_insufficient_credits")
            except Exception:
                pass
        try:
            err = ConnectorErrorResponse.model_validate(resp.json())
            raise ConnectorAPIError(resp.status_code, err.error, err.error_type, err.details)
        except ConnectorAPIError:
            raise
        except Exception:
            resp.raise_for_status()
    return LLMChatResponse.model_validate(resp.json())

