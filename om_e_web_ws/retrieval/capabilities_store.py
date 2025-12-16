"""
Index capabilities for semantic search.
Loads example JSON directly from capability files - no generation needed.
"""

import os
import json
from .vector_store import VectorStore

CAPABILITIES_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'capabilities')


class CapabilitiesStore(VectorStore):
    """
    Vector store for Om-E capabilities.

    Indexes capabilities with pre-defined example JSON for direct LLM use.
    """

    def __init__(self):
        super().__init__('capabilities')

    def build(self):
        """Build index from capability JSON files."""
        self.clear()

        texts = []
        metadata = []

        # Load index file to get list of capability files
        index_path = os.path.join(CAPABILITIES_DIR, '_index.json')
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                index_data = json.load(f)
                files = index_data.get('files', [])
        else:
            # Fallback: load all JSON files
            files = [f for f in os.listdir(CAPABILITIES_DIR)
                     if f.endswith('.json') and not f.startswith('_')]

        # Load each capability file
        for filename in files:
            filepath = os.path.join(CAPABILITIES_DIR, filename)
            if not os.path.exists(filepath):
                continue

            with open(filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)

            group = data.get('group', filename.replace('.json', ''))
            capabilities = data.get('capabilities', {})

            for cap_name, cap_info in capabilities.items():
                label = cap_info.get('label', cap_name)
                example = cap_info.get('example', f'{{"cap": "{cap_name}"}}')

                # Text to embed: name + label for semantic matching
                text = f"{cap_name}: {label}"

                texts.append(text)
                metadata.append({
                    'name': cap_name,
                    'group': group,
                    'label': label,
                    'example': example,
                    'handler': cap_info.get('handler', 'unknown')
                })

        if texts:
            self.add(texts, metadata)
            self.save()
            print(f"[CapabilitiesStore] Indexed {len(texts)} capabilities")
        else:
            print("[CapabilitiesStore] Warning: No capabilities found")
