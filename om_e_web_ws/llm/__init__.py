"""
Om-E LLM Module
===============
Local stateful agent with multi-provider LLM support.

Components:
    dispatcher.py   - Routes LLM actions to handlers (server internal, extension)

Usage:
    from llm.dispatcher import dispatch, parse_llm_response, load_capabilities
"""

from .dispatcher import (
    dispatch,
    parse_llm_response,
    validate_action,
    load_capabilities,
    get_capabilities,
    get_capability_info,
    is_internal_capability,
    format_result_for_llm,
    get_capabilities_for_prompt,
)

__all__ = [
    "dispatch",
    "parse_llm_response",
    "validate_action",
    "load_capabilities",
    "get_capabilities",
    "get_capability_info",
    "is_internal_capability",
    "format_result_for_llm",
    "get_capabilities_for_prompt",
]
