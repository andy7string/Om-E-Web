"""
FAISS-based retrieval for Om-E prompt optimization.
"""

from .vector_store import VectorStore, SearchResult, get_model
from .capabilities_store import CapabilitiesStore
from .elements_store import ElementsStore
from .chat_memory_store import ChatMemoryStore, get_recent_messages
from .query import (
    query,
    build_system_prompt,
    rebuild_elements_store,
    rebuild_chat_memory_store,
    query_chat_memory
)

__all__ = [
    'VectorStore',
    'SearchResult',
    'get_model',
    'CapabilitiesStore',
    'ElementsStore',
    'ChatMemoryStore',
    'get_recent_messages',
    'query',
    'build_system_prompt',
    'rebuild_elements_store',
    'rebuild_chat_memory_store',
    'query_chat_memory'
]
