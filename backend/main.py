import os
import shutil
import logging

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from rag_engine import process_pdf, query

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="RAG Chatbot API",
    description="Upload a PDF, then ask questions grounded in its content.",
    version="1.0.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# The React dev server runs on 5173. Both origins are whitelisted so the app
# works identically in local dev and inside Docker Compose.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite dev server
        "http://localhost:3000",   # fallback / alternative dev port
        "http://frontend:5173",    # Docker Compose service-name resolution
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Upload directory ──────────────────────────────────────────────────────────
UPLOADS_DIR = "./uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)

# ── Request / Response models ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str

class ChatResponse(BaseModel):
    answer: str
    sources: list[str]

class UploadResponse(BaseModel):
    message: str
    filename: str
    chunks: int

class HealthResponse(BaseModel):
    status: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check():
    """
    Liveness probe used by Docker health checks and Railway.
    Returns 200 immediately — no dependencies checked.
    """
    return {"status": "ok"}


@app.post("/upload", response_model=UploadResponse, tags=["Document"])
async def upload_pdf(file: UploadFile = File(...)):
    """
    Indexing pipeline:
        1. Save the uploaded PDF to disk
        2. Load → chunk → embed → store in ChromaDB
        3. Return chunk count as confirmation to the frontend

    Only PDF files are accepted. The previous index is wiped on each upload
    (single-document mode — extend later for multi-doc support).
    """
    # ── Validate file type ────────────────────────────────────────────────────
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported. Please upload a .pdf file.",
        )

    # ── Save to disk ──────────────────────────────────────────────────────────
    save_path = os.path.join(UPLOADS_DIR, file.filename)
    try:
        with open(save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        log.info("Saved upload: %s", save_path)
    except Exception as exc:
        log.exception("Failed to save uploaded file")
        raise HTTPException(status_code=500, detail=f"Could not save file: {exc}")
    finally:
        await file.close()

    # ── Run indexing pipeline ─────────────────────────────────────────────────
    try:
        chunk_count = process_pdf(save_path)
        log.info("Indexed %d chunks from '%s'", chunk_count, file.filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        # process_pdf raises ValueError for scanned/image-only PDFs
        raise HTTPException(status_code=422, detail=str(exc))
    except EnvironmentError as exc:
        # Missing GOOGLE_API_KEY
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        log.exception("Indexing failed for '%s'", file.filename)
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}")

    return UploadResponse(
        message=f"Successfully processed '{file.filename}'",
        filename=file.filename,
        chunks=chunk_count,
    )


@app.post("/chat", response_model=ChatResponse, tags=["Chat"])
async def chat(request: ChatRequest):
    """
    Query pipeline:
        1. Embed the question locally using HuggingFace (all-MiniLM-L6-v2)
        2. Similarity search → top-3 chunks from ChromaDB (local vector store)
        3. Assemble prompt with retrieved context
        4. Gemini 2.0 Flash generates a grounded answer

    The 'sources' field in the response contains the raw text of each
    retrieved chunk — use these in the frontend for page attribution.
    """
    # ── Validate input ────────────────────────────────────────────────────────
    question = request.question.strip()
    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty.",
        )
    if len(question) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Question is too long. Please keep it under 2000 characters.",
        )

    # ── Run query pipeline ────────────────────────────────────────────────────
    try:
        result = query(question)
        log.info("Q: %s… → %d source chunks", question[:60], len(result["sources"]))
    except RuntimeError as exc:
        # No PDF uploaded yet — rag_engine raises RuntimeError in this case
        raise HTTPException(status_code=400, detail=str(exc))
    except EnvironmentError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        log.exception("Query failed for question: '%s'", question[:80])
        raise HTTPException(status_code=500, detail=f"Query failed: {exc}")

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"],
    )


# ── Dev entrypoint ────────────────────────────────────────────────────────────
# Used when running directly: `python main.py`
# In production / Docker use: `uvicorn main:app --host 0.0.0.0 --port 8000`
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)