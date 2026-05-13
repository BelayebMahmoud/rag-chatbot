# Document Q&A — RAG Chatbot

A production-grade Retrieval-Augmented Generation (RAG) chatbot that lets you upload multiple PDFs and ask questions across all of them. Answers are grounded strictly in the documents — no hallucination, no guessing.

Built as Portfolio Project #1 for a Full Stack AI internship application.

---

## Live Demo

> Coming soon after deployment — link will be added here.

---

## What it does

1. **Upload PDFs** — each document is split into chunks, converted to vectors using local embeddings, and stored in ChromaDB (persisted to disk)
2. **Manage documents** — list all indexed files or delete individual ones without clearing the whole index
3. **Ask questions** — your question is embedded, matched against all stored chunks via MMR retrieval, and sent to Gemini with only the relevant context
4. **Get grounded answers** — every response includes the exact source passages and filenames it was based on

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| AI Framework | LangChain v0.3 (LCEL) | Industry standard for RAG pipelines |
| Embeddings | HuggingFace `all-MiniLM-L6-v2` | Fully local — no API dependency |
| LLM | Google Gemini 2.5 Flash | Free tier, fast, reliable |
| Vector Store | ChromaDB | File-based, persistent, no infrastructure needed |
| Backend | FastAPI + Uvicorn | Async, auto Swagger docs |
| Frontend | React + Vite | Fast setup, modern tooling |
| HTTP Client | Axios | Clean API calls from React |

---

## Project Structure

```
rag-chatbot/
├── backend/
│   ├── main.py              # FastAPI app — /upload, /chat, /documents, /health routes
│   ├── rag_engine.py        # Core RAG logic — load, chunk, embed, store, query
│   ├── requirements.txt     # Python dependencies (fully pinned)
│   ├── .env.example         # Environment variable template
│   ├── uploads/             # Uploaded PDFs (auto-created, git-ignored)
│   └── chroma_db/           # ChromaDB persistent storage (auto-created, git-ignored)
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Full chat UI — upload + chat + source attribution
│   │   └── main.jsx         # React entry point
│   ├── vite.config.js       # Vite + proxy config
│   └── package.json
├── .gitignore
└── README.md
```

---

## How RAG works — the two pipelines

### Indexing pipeline (triggered on PDF upload)
```
PDF Upload
    → PyPDFLoader      — extract text page by page
    → TextSplitter     — chunk into 1000-char fragments, 200-char overlap
    → HuggingFace      — convert each chunk to a 384-dim vector (local, no API)
    → ChromaDB         — persist vectors + text to disk
```

### Query pipeline (triggered on every question)
```
User Question
    → HuggingFace      — embed question (same model, critical)
    → ChromaDB         — MMR search: fetch 20 candidates → return top 5 diverse chunks
    → Prompt assembly  — "Answer using ONLY the context below…"
    → Gemini 2.5 Flash — generate grounded answer
    → Response         — { answer, sources[] }
```

MMR (Maximal Marginal Relevance) picks chunks that are both relevant to the question and diverse from each other, reducing redundant context sent to the LLM.

---

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A free Gemini API key from [aistudio.google.com](https://aistudio.google.com/app/apikey)

---

### Backend

```bash
# 1. Navigate to backend
cd backend

# 2. Create and activate virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate
# Mac/Linux
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create your environment file
cp .env.example .env       # Mac/Linux
copy .env.example .env     # Windows

# 5. Add your Gemini API key to .env
GEMINI_API_KEY=your-key-here

# 6. Start the backend
uvicorn main:app --reload --port 8000
```

Backend is running at → `http://localhost:8000`
Swagger UI available at → `http://localhost:8000/docs`

---

### Frontend

```bash
# 1. Navigate to frontend (new terminal)
cd frontend

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Frontend is running at → `http://localhost:5173`

---

### Test the full flow

1. Open `http://localhost:5173`
2. Upload one or more PDFs using the sidebar
3. Wait for the chunk count confirmation
4. Ask a question about the documents
5. See the grounded answer with source passages and filenames

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

Returns `409` if the file is already indexed, `413` if it exceeds 50 MB.

---

### `GET /documents`
List all currently indexed documents.

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
Remove a document from the index and delete it from disk.

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

Returns `404` if the file is not in the index.

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
      "text": "chunk text that was retrieved...",
      "filename": "report.pdf",
      "page": 3
    }
  ]
}
```

Question length is validated to 1–2000 characters.

---

### `GET /health`
Liveness check — also verifies ChromaDB connectivity.

```json
{ "status": "ok", "indexed_documents": 2 }
```

---

## Key RAG Parameters

These parameters control retrieval quality. They live in `rag_engine.py`.

```python
CHUNK_SIZE    = 1000  # chars per chunk — larger chunks preserve more context
CHUNK_OVERLAP = 200   # shared chars between adjacent chunks — prevents boundary cuts
TOP_K         = 5     # diverse chunks returned by MMR and sent to the LLM

# MMR retrieval settings (in query_rag)
fetch_k       = 20    # candidate pool size before MMR re-ranking
lambda_mult   = 0.7   # balance between relevance (1.0) and diversity (0.0)
```

---

## Security

| Protection | Implementation |
|---|---|
| Path traversal | Filenames are stripped of directory components and validated against `[\w\-. ]+` |
| Upload size limit | Files exceeding 50 MB are rejected with HTTP 413 before hitting disk |
| Question length | Pydantic rejects questions outside 1–2000 characters with HTTP 422 |
| CORS | Allowed origins are read from `CORS_ORIGINS` env var — locked down in production |

---

## Known Limitations

| Limitation | Cause | Workaround |
|---|---|---|
| Scanned PDFs return no text | Image-only PDF, no text layer | Use OCR pre-processing |
| Cold start delay (~30s) | Free hosting tier spins down | Expected — first request wakes the server |
| ChromaDB on free hosting | Some free tiers use ephemeral filesystems | Use a managed vector DB (Pinecone, Weaviate) for persistent cloud deployment |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key from aistudio.google.com |
| `CORS_ORIGINS` | No | `http://localhost:5173,http://localhost:3000` | Comma-separated list of allowed frontend origins |

Copy `.env.example` to `.env` and fill in your key. Never commit `.env`.

---

## Author

**Mahmoud BELAYEB** — 4th year Software Engineering student
Building full-stack AI projects for a summer internship in Agentic AI.

[GitHub](https://github.com/BelayebMahmoud) · [LinkedIn](https://www.linkedin.com/in/mahmoud-belayeb/)

---

## License

MIT — free to use, fork, and learn from.
