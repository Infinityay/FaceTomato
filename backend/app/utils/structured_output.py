"""Structured output fallback helpers."""

from __future__ import annotations

import json
import re
from typing import Optional


def invoke_with_fallback(llm, messages, response_cls):
    try:
        return llm.invoke(messages)
    except Exception as exc:
        parsed = _fallback_parse(exc, response_cls)
        if parsed is not None:
            return parsed
        raise


def extract_structured_output_json(exc: Exception):
    raw_text = _extract_input_value(exc)
    if not raw_text:
        return None

    cleaned = _strip_code_fence(raw_text)
    if "\\n" in cleaned:
        cleaned = cleaned.replace("\\n", "\n")

    try:
        return json.loads(cleaned)
    except Exception:
        return None


def _fallback_parse(exc: Exception, response_cls):
    data = extract_structured_output_json(exc)
    if data is None:
        return None

    try:
        return response_cls.model_validate(data)
    except Exception:
        return None


def _strip_code_fence(text: str) -> str:
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return text.strip()


def _extract_input_value(exc: Exception) -> Optional[str]:
    if hasattr(exc, "errors"):
        try:
            for err in exc.errors():
                value = err.get("input")
                if isinstance(value, str) and value.strip():
                    return value
                value = err.get("input_value")
                if isinstance(value, str) and value.strip():
                    return value
        except Exception:
            pass

    match = re.search(r"input_value='(.*)'", str(exc), re.S)
    if match:
        return match.group(1)
    return None
