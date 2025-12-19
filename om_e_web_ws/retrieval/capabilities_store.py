"""
Two-tier capability indexing for semantic search.

Architecture:
1. PRIMARY embeddings (1 per capability): "{action}: {label}. {description}"
2. SYNONYM embeddings (4-6 per capability): each synonym embedded separately

This prevents synonym dilution and improves matching accuracy.
Single source of truth: internal_capabilities.json
"""

import os
import json
from collections import defaultdict
from typing import List, Dict, Tuple, Optional
from .vector_store import VectorStore, SearchResult, get_model

CAPABILITIES_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'capabilities', 'internal_capabilities.json')


class CapabilitiesStore(VectorStore):
    """
    Two-tier vector store for Om-E capabilities.

    - Primary vectors: action + label + description (no synonyms)
    - Synonym vectors: each synonym separately, pointing to parent capability

    Search returns grouped results with max score per capability.
    """

    def __init__(self):
        super().__init__('capabilities')
        self._capabilities_cache: Dict[str, dict] = {}  # action -> full capability info

    def load_or_build(self) -> bool:
        """
        Load index from disk, or rebuild if source file is newer.
        """
        index_path = os.path.join(self.base_path, 'index.faiss')

        need_rebuild = False

        if not os.path.exists(index_path):
            need_rebuild = True
            print(f"[CapabilitiesStore] Index not found, will build")
        elif os.path.exists(CAPABILITIES_FILE):
            source_mtime = os.path.getmtime(CAPABILITIES_FILE)
            index_mtime = os.path.getmtime(index_path)
            if source_mtime > index_mtime:
                need_rebuild = True
                print(f"[CapabilitiesStore] Source newer than index, rebuilding...")

        if need_rebuild:
            self.build()
            return self.count() > 0
        else:
            success = self.load()
            if success:
                self._load_capabilities_cache()
            return success

    def _load_capabilities_cache(self):
        """Load capabilities into cache for quick lookup."""
        if not os.path.exists(CAPABILITIES_FILE):
            return
        with open(CAPABILITIES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for cap_name, cap_info in data.get('capabilities', {}).items():
            if not cap_info.get('internal', False):
                self._capabilities_cache[cap_name] = cap_info

    def build(self):
        """
        Build two-tier index from internal_capabilities.json.

        Creates:
        - 1 PRIMARY vector per capability (label + description, no synonyms)
        - 1 vector per SYNONYM (pointing to parent capability)
        """
        self.clear()
        self._capabilities_cache = {}

        texts = []
        metadata = []

        if not os.path.exists(CAPABILITIES_FILE):
            print(f"[CapabilitiesStore] Error: {CAPABILITIES_FILE} not found")
            return

        with open(CAPABILITIES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        capabilities = data.get('capabilities', {})
        primary_count = 0
        synonym_count = 0

        for cap_name, cap_info in capabilities.items():
            # Skip internal capabilities (not exposed to LLM)
            if cap_info.get('internal', False):
                continue

            label = cap_info.get('label', cap_name)
            description = cap_info.get('description', label)
            synonyms = cap_info.get('synonyms', [])
            example = cap_info.get('example', f'{{"cap": "{cap_name}"}}')
            group = cap_info.get('group', 'unknown')
            params = cap_info.get('params', {})

            # Cache full capability info
            self._capabilities_cache[cap_name] = cap_info

            # --- PRIMARY EMBEDDING ---
            # Clean text: action + label + description (NO synonyms!)
            primary_text = f"{cap_name}: {label}. {description}"
            texts.append(primary_text)
            metadata.append({
                'name': cap_name,
                'type': 'primary',  # Mark as primary embedding
                'group': group,
                'label': label,
                'description': description,
                'example': example,
                'synonyms': synonyms,
                'params': params
            })
            primary_count += 1

            # --- SYNONYM EMBEDDINGS ---
            # Each synonym gets its own vector, pointing to parent capability
            # Limit to first 6 synonyms (should be curated in JSON)
            for i, synonym in enumerate(synonyms[:6]):
                texts.append(synonym)
                metadata.append({
                    'name': cap_name,  # Points to parent capability
                    'type': 'synonym',  # Mark as synonym embedding
                    'synonym_text': synonym,
                    'synonym_index': i,
                    'group': group,
                    'label': label,
                    'description': description,
                    'example': example,
                    'params': params
                })
                synonym_count += 1

        if texts:
            self.add(texts, metadata)
            self.save()
            print(f"[CapabilitiesStore] Indexed {primary_count} primary + {synonym_count} synonym = {len(texts)} total vectors")
        else:
            print("[CapabilitiesStore] Warning: No capabilities found")

    def search_capabilities(
        self,
        query: str,
        k: int = 12,
        threshold: float = 0.35
    ) -> List[Tuple[str, float, dict]]:
        """
        Search for capabilities with grouping and max-score aggregation.

        Args:
            query: User's natural language query
            k: Number of raw hits to retrieve (before grouping)
            threshold: Minimum similarity score

        Returns:
            List of (action_name, max_score, capability_info) tuples,
            sorted by score descending. One entry per unique capability.
        """
        if self.index is None or self.index.ntotal == 0:
            return []

        # Get raw search results
        raw_results = self.search(query, k=k, threshold=threshold)

        if not raw_results:
            return []

        # Group by capability name, take MAX score per capability
        scores: Dict[str, float] = defaultdict(float)
        cap_info: Dict[str, dict] = {}

        for result in raw_results:
            action = result.metadata.get('name', '')
            if not action:
                continue

            # Take max score for this capability
            if result.score > scores[action]:
                scores[action] = result.score
                cap_info[action] = result.metadata

        # Sort by score descending
        sorted_caps = sorted(scores.items(), key=lambda x: x[1], reverse=True)

        # Return as list of tuples
        return [(action, score, cap_info[action]) for action, score in sorted_caps]

    def get_capability(self, action: str) -> Optional[dict]:
        """Get full capability info by action name."""
        return self._capabilities_cache.get(action)

    def get_all_capabilities(self) -> Dict[str, dict]:
        """Get all capabilities."""
        return self._capabilities_cache.copy()
