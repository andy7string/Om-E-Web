"""
Index page elements for semantic search.
Rebuilds every time text.md is written (page elements are ephemeral).
"""

import os
import re
from typing import Optional
from .vector_store import VectorStore

TEXT_MD_PATH = os.path.join(os.path.dirname(__file__), '..', '@site_structures', 'text.md')


class ElementsStore(VectorStore):
    """
    Vector store for page elements.

    Indexes elements from text.md for semantic search.
    Allows matching user intent like "click full report" to element ID 32.

    Note: Elements are ephemeral - not saved to disk, rebuilt each scan.
    """

    def __init__(self):
        super().__init__('page_elements')

    def build(self, text_md_path: Optional[str] = None):
        """
        Build index from text.md.

        Args:
            text_md_path: Override path to text.md (for testing)
        """
        self.clear()

        path = text_md_path or TEXT_MD_PATH

        if not os.path.exists(path):
            print("[FAISS] No text.md found, skipping elements indexing")
            return

        texts = []
        metadata = []

        # Pattern: [ID] Type: Label
        # Examples:
        #   [32] Link: Full Report
        #   [7] Select: Search
        #   [3] Button: Login
        pattern = r'\[(\d+)\]\s+(Link|Button|Input|Select):\s+(.+?)(?:\s*$)'

        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                match = re.search(pattern, line)
                if match:
                    element_id = int(match.group(1))
                    element_type = match.group(2)
                    label = match.group(3).strip()

                    # Clean up label (remove trailing arrows, JSON hints, etc.)
                    label = re.sub(r'\s*→.*$', '', label)

                    # Text to embed: just the semantic label
                    texts.append(label)
                    metadata.append({
                        'id': element_id,
                        'type': element_type,
                        'label': label
                    })

        if texts:
            self.add(texts, metadata)
            # Don't save to disk - elements are ephemeral (change with each page)
            print(f"[FAISS] Indexed {len(texts)} page elements")
        else:
            print("[FAISS] No actionable elements found in text.md")

    def get_element_by_id(self, element_id: int) -> Optional[dict]:
        """Get element metadata by ID."""
        for meta in self.metadata:
            if meta['id'] == element_id:
                return meta
        return None
