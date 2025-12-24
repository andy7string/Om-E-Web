"""
Base VectorStore class for FAISS-based semantic search.
Uses bge-base-en-v1.5 for embeddings (768 dims).
Supports hybrid BM25 + vector search with RRF fusion.
"""

import os
import re
import json
import time
import faiss
import numpy as np
from numpy import ndarray
from sentence_transformers import SentenceTransformer
from rank_bm25 import BM25Okapi
from typing import List, Optional, Any, cast, Dict
from dataclasses import dataclass

# Singleton model instance (loaded once, shared across stores)
_model = None
_model_load_time = None


def get_model() -> SentenceTransformer:
    """Get or create the singleton embedding model."""
    global _model, _model_load_time
    if _model is None:
        t0 = time.time()
        print("[FAISS] ⚡ Loading bge-base-en-v1.5 model (first call)...")
        _model = SentenceTransformer('BAAI/bge-base-en-v1.5')
        _model_load_time = time.time() - t0
        print(f"[FAISS] Model loaded in {_model_load_time*1000:.0f}ms")
    return _model


def tokenize(text: str) -> List[str]:
    """Simple tokenizer for BM25 - lowercase and split on non-alphanumeric."""
    return re.findall(r'\w+', text.lower())


@dataclass
class SearchResult:
    """Result from a vector search."""
    text: str
    metadata: dict
    score: float


class VectorStore:
    """
    FAISS-based vector store for semantic search.

    Uses cosine similarity via normalized vectors + inner product.
    """

    def __init__(self, store_name: str, base_path: Optional[str] = None):
        """
        Initialize a vector store.

        Args:
            store_name: Name of this store (used for directory)
            base_path: Override base path for storage
        """
        self.store_name = store_name
        self.base_path = base_path or os.path.join(
            os.path.dirname(__file__), '..', 'data', 'vectors', 'system', store_name
        )
        self.index = None
        self.metadata = []
        self.texts = []

    def add(self, texts: List[str], metadata_list: List[dict]):
        """
        Add texts with metadata to the store.

        Args:
            texts: List of strings to embed
            metadata_list: List of metadata dicts (same length as texts)
        """
        if len(texts) != len(metadata_list):
            raise ValueError("texts and metadata_list must have same length")

        if not texts:
            return

        t0 = time.time()
        model = get_model()
        t1 = time.time()
        embeddings: ndarray = model.encode(texts, normalize_embeddings=True)  # type: ignore[assignment]
        t2 = time.time()

        # Create or update index
        if self.index is None:
            dim = int(embeddings.shape[1])
            self.index = faiss.IndexFlatIP(dim)  # Inner product = cosine with normalized vectors

        self.index.add(embeddings.astype('float32'))  # type: ignore[union-attr]
        self.texts.extend(texts)
        self.metadata.extend(metadata_list)
        t3 = time.time()
        print(f"[{self.store_name}] add(): model={t1-t0:.0f}ms encode={t2-t1:.0f}ms index={t3-t2:.0f}ms total={t3-t0:.0f}ms ({len(texts)} items)")

    def search(self, query: str, k: int = 5, threshold: float = 0.3) -> List[SearchResult]:
        """
        Search for similar texts.

        Args:
            query: Search query string
            k: Number of results to return
            threshold: Minimum similarity score (0-1)

        Returns:
            List of SearchResult objects, sorted by score descending
        """
        if self.index is None or self.index.ntotal == 0:
            return []

        t0 = time.time()
        model = get_model()
        t1 = time.time()
        query_embedding: ndarray = model.encode([query], normalize_embeddings=True)  # type: ignore[assignment]
        t2 = time.time()

        # Search (limit k to available vectors)
        k = min(k, self.index.ntotal)
        scores, indices = self.index.search(query_embedding.astype('float32'), k)  # type: ignore[union-attr]
        t3 = time.time()

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx >= 0 and score >= threshold:
                results.append(SearchResult(
                    text=self.texts[idx],
                    metadata=self.metadata[idx],
                    score=float(score)
                ))
        print(f"[{self.store_name}] search(): model={t1-t0:.0f}ms encode={t2-t1:.0f}ms faiss={t3-t2:.0f}ms total={t3-t0:.0f}ms")
        return results

    def hybrid_search(
        self,
        query: str,
        k: int = 5,
        threshold: float = 0.3,
        vector_weight: float = 0.6,
        bm25_weight: float = 0.4
    ) -> List[SearchResult]:
        """
        Hybrid search combining BM25 (keyword) + vector (semantic).
        Uses Reciprocal Rank Fusion (RRF) to merge rankings.

        Args:
            query: Search query string
            k: Number of results to return
            threshold: Minimum combined score (0-1)
            vector_weight: Weight for vector scores (default 0.6)
            bm25_weight: Weight for BM25 scores (default 0.4)

        Returns:
            List of SearchResult objects, sorted by combined score descending
        """
        if not self.texts:
            return []

        t0 = time.time()

        # BM25 scoring
        tokenized_corpus = [tokenize(t) for t in self.texts]
        bm25 = BM25Okapi(tokenized_corpus)
        query_tokens = tokenize(query)
        bm25_scores = bm25.get_scores(query_tokens)
        t1 = time.time()

        # Normalize BM25 scores to 0-1 range
        max_bm25 = max(bm25_scores) if max(bm25_scores) > 0 else 1.0
        bm25_scores_norm = [s / max_bm25 for s in bm25_scores]

        # Vector search (get all for fusion)
        vector_results = self.search(query, k=len(self.texts), threshold=0.0)
        t2 = time.time()

        # Build vector score lookup
        vector_scores: Dict[int, float] = {}
        for result in vector_results:
            # Find index of this text in self.texts
            try:
                idx = self.texts.index(result.text)
                vector_scores[idx] = result.score
            except ValueError:
                pass

        # Combine scores using weighted average
        combined_scores: List[tuple[int, float]] = []
        for idx in range(len(self.texts)):
            v_score = vector_scores.get(idx, 0.0)
            b_score = bm25_scores_norm[idx]
            combined = (vector_weight * v_score) + (bm25_weight * b_score)
            combined_scores.append((idx, combined))

        # Sort by combined score descending
        combined_scores.sort(key=lambda x: x[1], reverse=True)
        t3 = time.time()

        # Build results
        results = []
        for idx, score in combined_scores[:k]:
            if score >= threshold:
                results.append(SearchResult(
                    text=self.texts[idx],
                    metadata=self.metadata[idx],
                    score=score
                ))

        print(f"[{self.store_name}] hybrid_search(): bm25={t1-t0:.0f}ms vector={t2-t1:.0f}ms fusion={t3-t2:.0f}ms total={t3-t0:.0f}ms")
        return results

    def clear(self):
        """Clear the store (remove all vectors and metadata)."""
        self.index = None
        self.metadata = []
        self.texts = []

    def save(self):
        """Save index and metadata to disk."""
        os.makedirs(self.base_path, exist_ok=True)

        if self.index is not None and self.index.ntotal > 0:
            index_path = os.path.join(self.base_path, 'index.faiss')
            faiss.write_index(self.index, index_path)

        meta_path = os.path.join(self.base_path, 'metadata.json')
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump({'texts': self.texts, 'metadata': self.metadata}, f, indent=2)

    def load(self) -> bool:
        """
        Load index and metadata from disk.

        Returns:
            True if loaded successfully, False if files don't exist
        """
        index_path = os.path.join(self.base_path, 'index.faiss')
        meta_path = os.path.join(self.base_path, 'metadata.json')

        if not os.path.exists(index_path) or not os.path.exists(meta_path):
            print(f"[{self.store_name}] load(): files not found, will build")
            return False

        t0 = time.time()
        self.index = faiss.read_index(index_path)
        t1 = time.time()
        with open(meta_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            self.texts = data['texts']
            self.metadata = data['metadata']
        t2 = time.time()
        print(f"[{self.store_name}] load(): faiss={t1-t0:.0f}ms meta={t2-t1:.0f}ms total={t2-t0:.0f}ms ({len(self.texts)} items)")
        return True

    def count(self) -> int:
        """Return number of vectors in store."""
        return self.index.ntotal if self.index else 0

    def __repr__(self):
        return f"VectorStore('{self.store_name}', count={self.count()})"
