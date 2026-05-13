import logging
import os
import re
import shutil
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from rag_engine import index_document, list_documents, delete_document, query_rag

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
# Resolved relative to this file so the app works regardless of which
# directory uvicorn is launched from.
_BASE_DIR = Path(__file__).parent
UPLOAD_DIR = _BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# ── Limits ────────────────────────────────────────────────────────────────────
MAX_UPLOAD_BYTES = 50 * 1024 * 1024   # 50 MB
MAX_QUESTION_LEN = 2000               # characters

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Multi-File RAG Chatbot API",
    description="Upload multiple PDFs and ask questions across all of them.",
    version="2.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
_raw_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000",
)
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

_SAFE_FILENAME = re.compile(r"^[\w\-. ]+$")


def _safe_filename(name: str) -> str:
    """
    Reject filenames that could escape the uploads directory.
    Allows only word characters, hyphens, dots, and spaces.
    """
    # Strip any directory components first
    name = Path(name).name
    if not _SAFE_FILENAME.match(name):
        raise HTTPException(
            status_code=400,
            detail="Filename contains invalid characters.",
        )
    return name


# ── Request / Response models ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=MAX_QUESTION_LEN)


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]


class DocumentInfo(BaseModel):
    filename: str
    chunks: int


# ── ROUTES ────────────────────────────────────────────────────────────────────

@app.get("/health", summary="Liveness check")
async def health():
    docs = list_documents()
    return {"status": "ok", "indexed_documents": len(docs)}


@app.post("/upload", summary="Upload and index a PDF")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Accept a PDF, validate it, write it to disk, and index it into ChromaDB.

    Returns 409 if a file with the same name is already indexed.
    Returns 413 if the file exceeds the 50 MB size limit.
    """
    # ── Validate content type / extension ─────────────────────────────────
    filename = _safe_filename(file.filename or "")
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # ── Duplicate guard ────────────────────────────────────────────────────
    existing_names = {doc["filename"] for doc in list_documents()}
    if filename in existing_names:
        raise HTTPException(
            status_code=409,
            detail=f"'{filename}' is already indexed. Delete it first to re-upload.",
        )

    # ── Read file content and enforce size limit ───────────────────────────
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
        )

    # ── Write to disk ──────────────────────────────────────────────────────
    file_path = UPLOAD_DIR / filename
    file_path.write_bytes(content)
    logger.info("Saved upload: %s (%d bytes)", filename, len(content))

    # ── Index into ChromaDB ────────────────────────────────────────────────
    try:
        chunk_count = index_document(str(file_path), filename)
    except Exception as exc:
        file_path.unlink(missing_ok=True)
        logger.exception("Indexing failed for '%s'", filename)
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}") from exc

    return {
        "message": f"Successfully indexed '{filename}' — {chunk_count} chunks added.",
        "filename": filename,
        "chunks": chunk_count,
    }


@app.get("/documents", response_model=list[DocumentInfo], summary="List indexed documents")
async def get_documents():
    """Return all currently indexed files with their chunk counts."""
    return list_documents()


@app.delete("/documents/{filename}", summary="Remove a document from the index")
async def remove_document(filename: str):
    """
    Remove all chunks for one file from ChromaDB and delete it from disk.
    Returns 404 if the file is not found in the index.
    """
    filename = _safe_filename(filename)

    deleted_chunks = delete_document(filename)
    if deleted_chunks == 0:
        raise HTTPException(
            status_code=404,
            detail=f"'{filename}' not found in the index.",
        )

    (UPLOAD_DIR / filename).unlink(missing_ok=True)
    logger.info("Removed document '%s' (%d chunks).", filename, deleted_chunks)

    return {
        "message": f"'{filename}' removed — {deleted_chunks} chunks deleted.",
        "filename": filename,
        "chunks_deleted": deleted_chunks,
    }


@app.post("/chat", response_model=ChatResponse, summary="Ask a question across all indexed documents")
async def chat(request: ChatRequest):
    """
    Search across all indexed documents and return a grounded answer with sources.
    Returns 400 if no documents are indexed.
    """
    if not list_documents():
        raise HTTPException(
            status_code=400,
            detail="No documents indexed. Upload at least one PDF first.",
        )

    try:
        result = query_rag(request.question)
    except RuntimeError as exc:
        # Configuration errors (e.g. missing API key) surfaced cleanly
        logger.error("Configuration error during RAG query: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected error during RAG query")
        raise HTTPException(status_code=500, detail=f"Query failed: {exc}") from exc

    return ChatResponse(answer=result["answer"], sources=result["sources"])
