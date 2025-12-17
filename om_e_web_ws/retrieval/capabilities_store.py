"""
Index capabilities for semantic search.
Single source of truth: internal_capabilities.json
"""

import os
import json
from .vector_store import VectorStore

CAPABILITIES_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'capabilities', 'internal_capabilities.json')


class CapabilitiesStore(VectorStore):
    """
    Vector store for Om-E capabilities.

    Indexes capabilities from internal_capabilities.json for semantic search.
    """

    def __init__(self):
        super().__init__('capabilities')

    def build(self):
        """Build index from internal_capabilities.json (single source of truth)."""
        self.clear()

        texts = []
        metadata = []

        if not os.path.exists(CAPABILITIES_FILE):
            print(f"[CapabilitiesStore] Error: {CAPABILITIES_FILE} not found")
            return

        with open(CAPABILITIES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        capabilities = data.get('capabilities', {})

        for cap_name, cap_info in capabilities.items():
            label = cap_info.get('label', cap_name)
            description = cap_info.get('description', label)
            synonyms = cap_info.get('synonyms', [])
            example = cap_info.get('example', f'{{"cap": "{cap_name}"}}')
            group = cap_info.get('group', 'unknown')
            params = cap_info.get('params', {})

            # Text to embed: name + label + description + synonyms for semantic matching
            synonyms_text = ', '.join(synonyms) if synonyms else ''
            text = f"{cap_name}: {label}. {description}. {synonyms_text}"

            texts.append(text)
            metadata.append({
                'name': cap_name,
                'group': group,
                'label': label,
                'description': description,
                'example': example,
                'synonyms': synonyms,
                'params': params
            })

        if texts:
            self.add(texts, metadata)
            self.save()
            print(f"[CapabilitiesStore] Indexed {len(texts)} capabilities from internal_capabilities.json")
        else:
            print("[CapabilitiesStore] Warning: No capabilities found")
