# Document Q&A — RAG Chatbot

A multi-file Retrieval-Augmented Generation (RAG) chatbot. Upload one or more PDFs, ask questions across all of them, and get answers that are strictly grounded in the documents — with the exact source passages cited.

Built as a portfolio project for a Full Stack AI internship application.

---

## What it does

1. **Upload PDFs** — each file is split into chunks, converted to 384-dim vectors using a local transformer model, and stored in ChromaDB on disk
2. **Manage documents** — list all indexed files (with chunk counts) or delete individual ones without clearing the whole index
3. **Ask questions** — your question is embedded with the same model, matched against stored chunks via MMR retrieval, and sent to Gemini with only the relevant context
4. **Get grounded answers** — every response includes the source passages and filenames it was based on; the model is instructed to say "I don't know based on the provided documents." when the answer is not present

---

## What runs locally vs. what requires an API key

This is the most important thing to understand about the architecture:

| Component | Where it runs | API key required? |
|---|---|---|
| `all-MiniLM-L6-v2` embeddings | Fully local — downloaded once on first run | No |
| ChromaDB vector store | Fully local — persisted to `backend/chroma_db/` on disk | No |
| Google Gemini 2.5 Flash | Remote API call on every chat request | Yes — `GEMINI_API_KEY` |

The embedding model (`all-MiniLM-L6-v2`, ~90 MB) is downloaded automatically from HuggingFace on first run and cached by `sentence-transformers`. After that, all embedding operations — both during indexing and at query time — run entirely offline. No data leaves your machine until you send a question, at which point only the retrieved context chunks and your question are sent to the Gemini API.

Get a free Gemini API key at [aistudio.google.com](https://aistudio.google.com/app/apikey).

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Backend framework | FastAPI + Uvicorn | 0.136.1 / 0.46.0 |
| RAG framework | LangChain (LCEL) | 1.3.0 |
| Embeddings | HuggingFace `all-MiniLM-L6-v2` via `sentence-transformers` | 5.5.0 |
| Vector store | ChromaDB (file-persisted) | 1.5.9 |
| LLM | Google Gemini 2.5 Flash via `langchain-google-genai` | 4.2.2 |
| PDF loader | pypdf via `langchain-community` | 6.11.0 |
| Frontend | React 19 + Vite 8 | — |
| HTTP client | Axios | ^1.15.2 |

---

## Project Structure

```
rag-chatbot/
├── backend/
│   ├── main.py              # FastAPI app — routes, input validation, CORS, filename sanitization
│   ├── rag_engine.py        # All RAG logic — indexing pipeline, query pipeline, document management
│   ├── requirements.txt     # Python dependencies (fully pinned)
│   ├── .env.example         # Environment variable template
│   ├── uploads/             # Uploaded PDFs (auto-created, git-ignored)
│   └── chroma_db/           # ChromaDB persistent storage (auto-created, git-ignored)
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Single-file React app — sidebar + chat UI + source attribution
│   │   └── main.jsx         # React entry point
│   ├── vite.config.js       # Vite dev server + proxy config
│   └── package.json
├── .gitignore
└── README.md
```

---

## How each component works

### Embeddings — local, no API cost

`HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")` runs a `sentence-transformers` model entirely in-process, producing 384-dimensional float vectors. The same model instance is used for both indexing and querying — this is a requirement; if you ever swap the embedding model, you must re-index all documents from scratch. The model is initialised lazily on first use to avoid a startup delay.

### Vector store — ChromaDB on disk

ChromaDB persists to `backend/chroma_db/` with a single collection named `rag_documents`. Chunk IDs follow the pattern `{filename}_chunk_{i}` (e.g. `report.pdf_chunk_0`). This deterministic naming is what makes per-file deletion work: to remove a document, the engine queries for all chunks whose `metadata["source"]` matches the filename and deletes them by ID.

### LLM — Gemini 2.5 Flash via REST API

`ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0)`. Temperature 0 means the model always picks the highest-probability token — responses are deterministic and conservative, which is appropriate for a document Q&A task. A missing `GEMINI_API_KEY` raises a `RuntimeError` at first use and surfaces as an HTTP 500.

### Prompt — strictly grounded, no free-form generation

The system prompt instructs the model to answer using only the provided context and to respond "I don't know based on the provided documents." if the answer is absent. There is no fallback to the model's training data. The exact prompt lives in `rag_engine.py:query_rag`.

---

## Chunking and Retrieval Strategy

### Chunking parameters

```python
CHUNK_SIZE    = 1000  # characters per chunk
CHUNK_OVERLAP = 200   # characters shared between adjacent chunks
```

`RecursiveCharacterTextSplitter` splits text at natural boundaries (paragraphs, sentences) before falling back to hard character cuts. A 1000-character chunk is roughly half a page — large enough to preserve a coherent idea, small enough that the top-5 chunks fit comfortably in a Gemini context window. The 200-character overlap prevents a sentence from being split cleanly across two chunks where neither half contains enough context to answer a question about it.

### MMR retrieval vs. plain similarity search

Plain similarity search returns the top-k chunks by cosine distance. If your document repeats the same paragraph or table several times, all k slots get filled by near-duplicate passages — wasting context budget. MMR (Maximal Marginal Relevance) solves this by balancing relevance against diversity.

```python
# In rag_engine.py:query_rag
retriever = vectorstore.as_retriever(
    search_type="mmr",
    search_kwargs={"k": 5, "fetch_k": 20, "lambda_mult": 0.7},
)
```

| Parameter | Value | Meaning |
|---|---|---|
| `fetch_k` | 20 | Retrieve the 20 most similar chunks from ChromaDB first |
| `k` | 5 | From those 20, select 5 that are both relevant and diverse |
| `lambda_mult` | 0.7 | Weight: 1.0 = pure relevance, 0.0 = pure diversity; 0.7 leans toward relevance |

The 20-candidate pool gives MMR room to pick diverse chunks; returning only 5 to the LLM keeps the prompt tight.

---

## How RAG works — the two pipelines

### Indexing pipeline (triggered on PDF upload)

```
PDF Upload
    → PyPDFLoader           — extract text page by page (text-layer PDFs only)
    → RecursiveCharacterTextSplitter  — chunk: 1000 chars, 200 overlap
    → HuggingFaceEmbeddings — convert each chunk to a 384-dim vector (local, no API)
    → ChromaDB              — persist vectors + text to backend/chroma_db/
                              IDs: {filename}_chunk_0, {filename}_chunk_1, …
```

### Query pipeline (triggered on every chat message)

```
User Question
    → HuggingFaceEmbeddings — embed question (same model as indexing — mandatory)
    → ChromaDB MMR          — fetch 20 candidates, return 5 diverse chunks
    → Prompt assembly       — "Answer using ONLY the context below…"
    → Gemini 2.5 Flash API  — generate grounded answer (temperature=0)
    → Response              — { answer, sources[{text, filename, page}] }
```

---

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A free Gemini API key from [aistudio.google.com](https://aistudio.google.com/app/apikey)

> On first run the backend downloads the `all-MiniLM-L6-v2` model (~90 MB) from HuggingFace. This is a one-time download; subsequent starts are fast.

### Backend

```bash
# 1. Navigate to backend
cd backend

# 2. Create and activate a virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate
# Mac/Linux
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create your environment file
copy .env.example .env     # Windows
cp .env.example .env       # Mac/Linux

# 5. Open .env and add your Gemini API key
#    GEMINI_API_KEY=your-key-here

# 6. Start the backend
uvicorn main:app --reload --port 8000
```

Backend: `http://localhost:8000`
Swagger UI: `http://localhost:8000/docs`

### Frontend

```bash
# New terminal
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

### Test the full flow

1. Open `http://localhost:5173`
2. Upload one or more PDFs from the left sidebar (multiple files can be selected at once — they upload sequentially)
3. Wait for the chunk count confirmation in the sidebar
4. Type a question and press Enter
5. The answer appears with the source passages and filenames it was drawn from

---

## API Reference

### `POST /upload`

Upload a PDF for indexing. Max file size: 50 MB.

```bash
curl -X POST http://localhost:8000/upload \
  -F "file=@your-document.pdf"
```

```json
{
  "message": "Successfully indexed 'your-document.pdf' — 42 chunks added.",
  "filename": "your-document.pdf",
  "chunks": 42
}
```

| Status | Condition |
|---|---|
| `200` | File indexed successfully |
| `400` | Not a PDF, or filename contains invalid characters |
| `409` | File already indexed — delete it first to re-upload |
| `413` | File exceeds 50 MB |
| `500` | Indexing failed (e.g. corrupted PDF, missing API key) |

---

### `GET /documents`

List all currently indexed documents with chunk counts.

```bash
curl http://localhost:8000/documents
```

```json
[
  { "filename": "report.pdf", "chunks": 42 },
  { "filename": "manual.pdf", "chunks": 87 }
]
```

---

### `DELETE /documents/{filename}`

Remove a document from the index and delete it from disk. Removes all chunks for that file from ChromaDB by matching the `{filename}_chunk_{i}` ID pattern.

```bash
curl -X DELETE http://localhost:8000/documents/report.pdf
```

```json
{
  "message": "'report.pdf' removed — 42 chunks deleted.",
  "filename": "report.pdf",
  "chunks_deleted": 42
}
```

| Status | Condition |
|---|---|
| `200` | Document removed |
| `404` | Filename not found in the index |

---

### `POST /chat`

Ask a question across all indexed documents.

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the main topic of this document?"}'
```

```json
{
  "answer": "The document covers...",
  "sources": [
    {
      "text": "first 300 characters of the retrieved chunk...",
      "filename": "report.pdf",
      "page": 3
    }
  ]
}
```

Question length is validated by Pydantic to 1–2000 characters. Returns `400` if no documents are currently indexed. Returns `422` for an invalid request body.

---

### `GET /health`

Liveness check. Also calls `list_documents()` to verify ChromaDB connectivity.

```bash
curl http://localhost:8000/health
```

```json
{ "status": "ok", "indexed_documents": 2 }
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key from aistudio.google.com |
| `CORS_ORIGINS` | No | `http://localhost:5173,http://localhost:3000` | Comma-separated list of allowed frontend origins |

Copy `.env.example` to `.env` and fill in your key. Never commit `.env`.

---

## Security

| Protection | Implementation |
|---|---|
| Path traversal | `Path(name).name` strips directory components; remaining filename is validated against `^[\w\-. ]+$` |
| Upload size limit | Content is read into memory first; files exceeding 50 MB are rejected with HTTP 413 before touching disk |
| Question length | Pydantic `Field(min_length=1, max_length=2000)` rejects out-of-range questions with HTTP 422 |
| CORS | Allowed origins are read from `CORS_ORIGINS` env var — defaults to localhost only; set explicitly in production |
| Duplicate uploads | Re-uploading the same filename is blocked with HTTP 409 until the existing entry is deleted |

---

## Known Limitations

| Limitation | Cause | Notes |
|---|---|---|
| Scanned PDFs return no text | Image-only PDF — no text layer | Pre-process with an OCR tool (e.g. `ocrmypdf`) before uploading |
| First run is slow | `sentence-transformers` downloads `all-MiniLM-L6-v2` (~90 MB) | One-time cost; subsequent starts load from cache |
| ChromaDB not suited for cloud free tiers | Many free hosting platforms use ephemeral filesystems — the `chroma_db/` directory is wiped on redeploy | Replace with a managed vector DB (Pinecone, Weaviate) for persistent cloud deployment |
| Vite proxy gap | `vite.config.js` proxies `/upload`, `/chat`, and `/health` to port 8000, but `App.jsx` hardcodes `const API = "http://localhost:8000"` for all requests including `/documents` — the proxy is effectively bypassed for every call | This works fine in a standard local dev setup where both services are on the same machine; it becomes a problem if you run the frontend against a remote backend |

---

## Author

**Mahmoud BELAYEB** — 4th year Software Engineering student
Building full-stack AI projects for a summer internship in Agentic AI.

[GitHub](https://github.com/BelayebMahmoud) · [LinkedIn](https://www.linkedin.com/in/mahmoud-belayeb/)

---

## License

MIT — free to use, fork, and learn from.
