"""
FAISS-based retrieval for Om-E prompt optimization.
"""

from .vector_store import VectorStore, SearchResult, get_model
from .capabilities_store import CapabilitiesStore
from .elements_store import ElementsStore
from .query import query, build_system_prompt, rebuild_elements_store

__all__ = [
    'VectorStore',
    'SearchResult',
    'get_model',
    'CapabilitiesStore',
    'ElementsStore',
    'query',
    'build_system_prompt',
    'rebuild_elements_store'
]
