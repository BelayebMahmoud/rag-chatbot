import os
import shutil
import logging
from dotenv import load_dotenv

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings          # ← local embeddings
from langchain_google_genai import ChatGoogleGenerativeAI        # ← Gemini LLM (unchanged)
from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

load_dotenv()

log = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

CHROMA_DIR    = "./chroma_db"
UPLOADS_DIR   = "./uploads"
CHUNK_SIZE    = 500
CHUNK_OVERLAP = 50
TOP_K         = 3

# Best-in-class local embedding model for semantic search.
# ~90 MB, downloads once to ~/.cache/huggingface/ and runs fully offline after that.
# 384-dim vectors — smaller than OpenAI's 1536-dim but plenty for RAG retrieval.
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# ── Strict RAG prompt ─────────────────────────────────────────────────────────

RAG_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a precise assistant that answers questions strictly \
from the provided document context.

CONTEXT:
{context}

INSTRUCTIONS:
- Answer using ONLY the information in the context above.
- If the answer is not found in the context, say exactly: \
"I don't know — this information isn't in the uploaded document."
- Do not use your training knowledge to fill gaps.
- Be concise and direct. Quote the document where helpful."""),
    ("human", "{question}"),
])

# ── Module-level singletons ────────────────────────────────────────────────────

_embeddings:  HuggingFaceEmbeddings | None = None
_vectorstore: Chroma | None                = None
_chain                                     = None  # (chain, retriever) tuple


def _get_embeddings() -> HuggingFaceEmbeddings:
    """
    Return a cached HuggingFaceEmbeddings instance.

    model_kwargs  → forces CPU inference (no GPU required)
    encode_kwargs → normalise vectors so cosine similarity == dot product,
                    which is what ChromaDB uses internally.
    First call downloads the model; every subsequent call is instant.
    """
    global _embeddings
    if _embeddings is None:
        log.info("Loading local embedding model: %s", EMBEDDING_MODEL)
        _embeddings = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
        log.info("Embedding model loaded successfully.")
    return _embeddings


# ── STEP 1 — LOAD ─────────────────────────────────────────────────────────────

def load_pdf(file_path: str) -> list:
    """Load a PDF and return a list of Document objects (one per page)."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"PDF not found: {file_path}")

    loader = PyPDFLoader(file_path)
    pages  = loader.load()

    if not pages or all(p.page_content.strip() == "" for p in pages):
        raise ValueError(
            "No text could be extracted. "
            "This may be a scanned/image PDF — OCR support is needed."
        )

    log.info("Loaded %d pages from %s", len(pages), file_path)
    return pages


# ── STEP 2 — CHUNK ────────────────────────────────────────────────────────────

def chunk_documents(pages: list) -> list:
    """Split pages into overlapping chunks for granular retrieval."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(pages)
    log.info("Created %d chunks", len(chunks))
    return chunks


# ── STEPS 3 + 4 — EMBED & STORE ──────────────────────────────────────────────

def embed_and_store(chunks: list) -> Chroma:
    """
    Vectorise chunks with local HuggingFace embeddings and persist to ChromaDB.
    Wipes the previous index so each upload starts clean.
    """
    global _vectorstore, _chain

    if os.path.exists(CHROMA_DIR):
        shutil.rmtree(CHROMA_DIR)

    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=_get_embeddings(),   # ← local, no API call
        persist_directory=CHROMA_DIR,
    )

    _vectorstore = vectorstore
    _chain = None  # invalidate — rebuilt on next query
    log.info("Stored %d chunks in ChromaDB at %s", len(chunks), CHROMA_DIR)
    return vectorstore


# ── STEP 5 — BUILD LCEL CHAIN ─────────────────────────────────────────────────

def _format_docs(docs: list) -> str:
    """Concatenate retrieved chunk texts into a single context block."""
    return "\n\n---\n\n".join(doc.page_content for doc in docs)


def _build_chain(vectorstore: Chroma):
    """
    Wire together the LCEL RAG chain:
        question → retriever (local ChromaDB) → prompt → Gemini LLM → answer

    Only the LLM call hits the network. Embeddings are fully local.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "GEMINI_API_KEY is not set. Add it to backend/.env and restart."
        )

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",     # ← updated model name
        temperature=0,
        api_key=api_key,              # ← new parameter name in v4.0
    )

    retriever = vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": TOP_K},
    )

    chain = (
        {
            "context":  retriever | _format_docs,
            "question": RunnablePassthrough(),
        }
        | RAG_PROMPT
        | llm
        | StrOutputParser()
    )

    return chain, retriever


def _get_chain():
    """Return cached (chain, retriever), rebuilding if vectorstore changed."""
    global _chain, _vectorstore

    if _vectorstore is None:
        if os.path.exists(CHROMA_DIR):
            # Reload persisted DB after a server restart — no re-upload needed
            log.info("Reloading ChromaDB from disk: %s", CHROMA_DIR)
            _vectorstore = Chroma(
                persist_directory=CHROMA_DIR,
                embedding_function=_get_embeddings(),
            )
        else:
            raise RuntimeError(
                "No document uploaded yet. "
                "Please upload a PDF before asking questions."
            )

    if _chain is None:
        _chain = _build_chain(_vectorstore)

    return _chain  # (chain, retriever) tuple


# ── PUBLIC API — called by main.py ────────────────────────────────────────────

def process_pdf(file_path: str) -> int:
    """
    Full indexing pipeline: load → chunk → embed (local) → store.
    Returns chunk count shown to the user after upload.
    """
    pages  = load_pdf(file_path)
    chunks = chunk_documents(pages)
    embed_and_store(chunks)
    return len(chunks)


def query(question: str) -> dict:
    """
    Full query pipeline: embed question (local) → retrieve → generate (Gemini).

    Returns:
        { "answer": str, "sources": list[str] }
    """
    chain, retriever = _get_chain()

    # Retrieve source chunks for attribution (local vector search)
    source_docs = retriever.invoke(question)

    # Generate grounded answer via Gemini LLM
    answer = chain.invoke(question)

    # De-duplicate source texts, preserve order
    seen    = set()
    sources = []
    for doc in source_docs:
        text = doc.page_content.strip()
        if text and text not in seen:
            seen.add(text)
            sources.append(text)

    return {"answer": answer.strip(), "sources": sources}