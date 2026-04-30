# Document Q&A — RAG Chatbot

A production-grade Retrieval-Augmented Generation (RAG) chatbot that lets you upload any PDF and ask questions about its content. Answers are grounded strictly in the document — no hallucination, no guessing.

Built as Portfolio Project #1 for a Full Stack AI internship application.

---

## Live Demo

> Coming soon after deployment — link will be added here.

---

## What it does

1. **Upload a PDF** — the document is split into chunks, converted to vectors using local embeddings, and stored in ChromaDB
2. **Ask questions** — your question is embedded, matched against the stored chunks via similarity search, and sent to Gemini with only the relevant context
3. **Get grounded answers** — every response includes the exact source passages it was based on

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| AI Framework | LangChain v0.3 (LCEL) | Industry standard for RAG pipelines |
| Embeddings | HuggingFace `all-MiniLM-L6-v2` | Fully local — no API dependency |
| LLM | Google Gemini 2.5 Flash | Free tier, fast, reliable |
| Vector Store | ChromaDB | File-based, no infrastructure needed |
| Backend | FastAPI + Uvicorn | Async, auto Swagger docs |
| Frontend | React + Vite | Fast setup, modern tooling |
| HTTP Client | Axios | Clean API calls from React |

---

## Project Structure

```
rag-chatbot/
├── backend/
│   ├── main.py              # FastAPI app — /upload, /chat, /health routes
│   ├── rag_engine.py        # Core RAG logic — load, chunk, embed, store, query
│   ├── requirements.txt     # Python dependencies
│   ├── .env.example         # Environment variable template
│   └── uploads/             # Uploaded PDFs (auto-created, git-ignored)
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
    → TextSplitter     — chunk into 500-char overlapping fragments
    → HuggingFace      — convert each chunk to a 384-dim vector (local, no API)
    → ChromaDB         — persist vectors + text to disk
```

### Query pipeline (triggered on every question)
```
User Question
    → HuggingFace      — embed question (same model, critical)
    → ChromaDB         — cosine similarity search → top 3 chunks
    → Prompt assembly  — "Answer using ONLY the context below…"
    → Gemini 2.5 Flash — generate grounded answer
    → Response         — { answer, sources[] }
```

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
2. Upload any PDF using the sidebar
3. Wait for the chunk count confirmation
4. Ask a question about the document
5. See the grounded answer with source passages

---

## API Reference

### `POST /upload`
Upload a PDF for indexing.

```bash
curl -X POST http://localhost:8000/upload \
  -F "file=@your-document.pdf"
```

```json
{
  "message": "Successfully processed 'your-document.pdf'",
  "filename": "your-document.pdf",
  "chunks": 42
}
```

---

### `POST /chat`
Ask a question about the uploaded document.

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the main topic of this document?"}'
```

```json
{
  "answer": "The document covers...",
  "sources": [
    "chunk text 1 that was retrieved...",
    "chunk text 2 that was retrieved..."
  ]
}
```

---

### `GET /health`
Liveness check.

```json
{ "status": "ok" }
```

---

## Key RAG Parameters

These three parameters control retrieval quality. Tuning them is the most impactful way to improve answer accuracy.

```python
CHUNK_SIZE    = 500   # chars per chunk — too small loses context, too large adds noise
CHUNK_OVERLAP = 50    # shared chars between chunks — prevents cutting sentences at boundaries
TOP_K         = 3     # chunks sent to LLM — too few misses info, too many fills context window
```

---

## Known Limitations

| Limitation | Cause | Workaround |
|---|---|---|
| Scanned PDFs return no text | Image-only PDF, no text layer | Use OCR pre-processing |
| ChromaDB resets on server restart | Ephemeral storage in free deployment | Re-upload the PDF |
| Single document at a time | Simplified scope | Extend `embed_and_store()` to support multi-doc |
| Cold start delay (~30s) | Free hosting tier spins down | Expected — first request wakes the server |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key from aistudio.google.com |

Copy `.env.example` to `.env` and fill in your key. Never commit `.env`.

---

## Author

**Mahmoud BELAYEB** — 4th year Software Engineering student
Building full-stack AI projects for a summer internship in Agentic AI.

[GitHub](https://github.com/BelayebMahmoud) · [LinkedIn](https://www.linkedin.com/in/mahmoud-belayeb/)

---

## License

MIT — free to use, fork, and learn from.