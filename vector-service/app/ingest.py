"""
MedQuAD Ingestion Pipeline
===========================
Reads medquad.csv → cleans → chunks → embeds (OpenAI) → saves FAISS index + chunks.json

Usage:
    python -m app.ingest --csv /path/to/medquad.csv --out /data/faiss

Env vars:
    OPENAI_API_KEY        required
    OPENAI_EMBEDDING_MODEL  default text-embedding-3-small
    BATCH_SIZE            default 96 (stay under OpenAI TPM limits)
"""

import argparse
import csv
import json
import logging
import os
import re
import time
from pathlib import Path

import faiss
import numpy as np
from openai import OpenAI

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

EMBEDDING_MODEL = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
BATCH_SIZE      = int(os.getenv("BATCH_SIZE", "96"))
MAX_CHUNK_CHARS = 1200   # ~300 tokens — fits comfortably in context
MIN_CHUNK_CHARS = 80     # skip near-empty rows


# ── Text Cleaning ────────────────────────────────────────────────────────────

def clean(text: str) -> str:
    """Remove HTML artifacts, excessive whitespace, and encoding noise."""
    text = re.sub(r"<[^>]+>", " ", text)                   # strip HTML tags
    text = re.sub(r"\s+", " ", text)                        # collapse whitespace
    text = re.sub(r"[^\x00-\x7F]+", " ", text)             # strip non-ASCII (encoding noise)
    text = text.strip()
    return text


# ── Chunking ─────────────────────────────────────────────────────────────────

def make_chunk(question: str, answer: str, source: str, focus: str) -> str:
    """Combine Q+A into a single retrievable chunk string."""
    q = clean(question)
    a = clean(answer)
    if not q or not a or len(a) < MIN_CHUNK_CHARS:
        return ""
    chunk = f"Question: {q}\nAnswer: {a}"
    if len(chunk) > MAX_CHUNK_CHARS:
        chunk = chunk[:MAX_CHUNK_CHARS] + "…"
    return chunk


# ── OpenAI Embedding Batch ────────────────────────────────────────────────────

def embed_batch(client: OpenAI, texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts, with simple retry on rate-limit."""
    for attempt in range(4):
        try:
            resp = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
            return [item.embedding for item in resp.data]
        except Exception as e:
            wait = 2 ** attempt * 5
            log.warning(f"Embedding attempt {attempt+1} failed ({e}). Retrying in {wait}s…")
            time.sleep(wait)
    raise RuntimeError("Embedding failed after 4 attempts")


# ── Main Ingestion ────────────────────────────────────────────────────────────

def ingest(csv_path: Path, out_dir: Path) -> None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise EnvironmentError("OPENAI_API_KEY must be set")

    client = OpenAI(api_key=api_key, timeout=60)
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── Parse CSV ────────────────────────────────────────────────────────────
    log.info(f"Reading {csv_path} …")
    chunks_meta: list[dict] = []

    with open(csv_path, encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            chunk_text = make_chunk(
                row.get("question", ""),
                row.get("answer", ""),
                row.get("source", "MedQuAD"),
                row.get("focus_area", ""),
            )
            if chunk_text:
                chunks_meta.append({
                    "text":       chunk_text,
                    "source":     clean(row.get("source", "MedQuAD")),
                    "focus_area": clean(row.get("focus_area", "")),
                    "question":   clean(row.get("question", "")),
                })

    log.info(f"Parsed {len(chunks_meta):,} valid chunks from CSV")

    # ── Embed in batches ─────────────────────────────────────────────────────
    all_texts   = [c["text"] for c in chunks_meta]
    all_vectors: list[list[float]] = []

    total_batches = (len(all_texts) + BATCH_SIZE - 1) // BATCH_SIZE
    for i in range(0, len(all_texts), BATCH_SIZE):
        batch      = all_texts[i : i + BATCH_SIZE]
        batch_num  = i // BATCH_SIZE + 1
        log.info(f"Embedding batch {batch_num}/{total_batches} ({len(batch)} texts)…")
        vecs = embed_batch(client, batch)
        all_vectors.extend(vecs)

    log.info(f"Embedded {len(all_vectors):,} chunks")

    # ── Build FAISS index ─────────────────────────────────────────────────────
    dim    = len(all_vectors[0])
    matrix = np.array(all_vectors, dtype="float32")

    # Normalize for cosine similarity (inner product after L2 norm)
    faiss.normalize_L2(matrix)
    index = faiss.IndexFlatIP(dim)   # Inner Product ≡ cosine after normalization
    index.add(matrix)

    index_path = out_dir / "medical.index"
    meta_path  = out_dir / "chunks.json"

    faiss.write_index(index, str(index_path))
    meta_path.write_text(json.dumps(chunks_meta, ensure_ascii=False, indent=2), encoding="utf-8")

    log.info(f"✅ FAISS index saved → {index_path}  ({index.ntotal:,} vectors, dim={dim})")
    log.info(f"✅ Metadata saved    → {meta_path}  ({len(chunks_meta):,} chunks)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest MedQuAD CSV into FAISS")
    parser.add_argument("--csv", required=True, help="Path to medquad.csv")
    parser.add_argument("--out", default="/data/faiss", help="Output directory for index + metadata")
    args = parser.parse_args()
    ingest(Path(args.csv), Path(args.out))
