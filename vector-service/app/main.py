"""
PulseGuard AI — Vector Search Service
======================================
Serves the FAISS index built from MedQuAD (or any Q+A corpus).
Indexes are loaded once at startup and cached in memory for low-latency retrieval.

Endpoints:
  GET  /health          — liveness + index status
  POST /search          — semantic search (query → top-k chunks)
  GET  /metrics         — Prometheus metrics
"""

import json
import os
import time
import logging
from pathlib import Path
from functools import lru_cache

import faiss
import numpy as np
from fastapi import FastAPI
from fastapi.responses import Response
from openai import OpenAI
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

DATA_DIR        = Path(os.getenv("VECTOR_DATA_DIR", "/data/faiss"))
INDEX_PATH      = DATA_DIR / "medical.index"
META_PATH       = DATA_DIR / "chunks.json"
EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY", "missing-key")

app = FastAPI(title="PulseGuard AI Vector Service", version="0.2.0")

SEARCH_COUNT   = Counter("vector_search_requests_total", "Vector search request count")
SEARCH_LATENCY = Histogram("vector_search_latency_seconds", "Vector search latency")
CACHE_HITS     = Counter("vector_cache_hits_total", "FAISS index cache hits")

# ── In-memory index cache ─────────────────────────────────────────────────────
_index:  faiss.Index | None = None
_chunks: list[dict]         = []


def load_store() -> tuple[faiss.Index | None, list[dict]]:
    """Load the FAISS index and metadata once; return cached copies thereafter."""
    global _index, _chunks
    if _index is not None:
        CACHE_HITS.inc()
        return _index, _chunks
    if not INDEX_PATH.exists() or not META_PATH.exists():
        log.warning(f"Index not found at {INDEX_PATH}. Run the ingest pipeline first.")
        return None, []
    log.info(f"Loading FAISS index from {INDEX_PATH} …")
    _index  = faiss.read_index(str(INDEX_PATH))
    _chunks = json.loads(META_PATH.read_text(encoding="utf-8"))
    log.info(f"Index loaded: {_index.ntotal:,} vectors | {len(_chunks):,} metadata chunks")
    return _index, _chunks


@app.on_event("startup")
async def startup_event():
    """Pre-warm the FAISS index cache on container start."""
    load_store()


# ── Embedding helper ──────────────────────────────────────────────────────────

def _openai_client() -> OpenAI:
    return OpenAI(api_key=OPENAI_API_KEY, timeout=20)


def embed_query(text: str) -> np.ndarray:
    """Embed a single query string; normalize for cosine similarity."""
    resp   = _openai_client().embeddings.create(model=EMBEDDING_MODEL, input=[text])
    vector = np.array(resp.data[0].embedding, dtype="float32").reshape(1, -1)
    faiss.normalize_L2(vector)
    return vector


# ── Models ────────────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5
    min_score: float = 0.20   # cosine similarity threshold (0–1 after normalization)


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    index, chunks = load_store()
    return {
        "status":       "healthy",
        "index_loaded": index is not None,
        "total_vectors": index.ntotal if index else 0,
        "total_chunks": len(chunks),
        "embedding_model": EMBEDDING_MODEL,
    }


@app.get("/metrics")
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/search")
def search(payload: SearchRequest) -> dict:
    SEARCH_COUNT.inc()
    start = time.perf_counter()
    try:
        index, chunks = load_store()
        if index is None:
            return {"matches": [], "note": "Index not loaded. Run ingestion pipeline."}

        query_vector = embed_query(payload.query)
        k = min(payload.top_k, index.ntotal)

        scores, idxs = index.search(query_vector, k)

        matches = []
        for score, idx in zip(scores[0], idxs[0]):
            if idx < 0 or idx >= len(chunks):
                continue
            if float(score) < payload.min_score:
                continue
            chunk = chunks[idx]
            matches.append({
                "score":      round(float(score), 4),
                "text":       chunk["text"],
                "source":     chunk.get("source", "MedQuAD"),
                "focus_area": chunk.get("focus_area", ""),
                "question":   chunk.get("question", ""),
            })

        return {
            "query":   payload.query,
            "matches": matches,
            "retrieved": len(matches),
        }
    except Exception as e:
        log.error(f"Search error: {e}")
        return {"matches": [], "error": str(e)}
    finally:
        SEARCH_LATENCY.observe(time.perf_counter() - start)
