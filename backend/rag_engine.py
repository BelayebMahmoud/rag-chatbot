import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

logger = logging.getLogger(__name__)

# ── Paths resolved relative to this file so they are stable regardless
# of the working directory from which uvicorn is launched.
_BASE_DIR = Path(__file__).parent
CHROMA_DIR = str(_BASE_DIR / "chroma_db")
COLLECTION_NAME = "rag_documents"

# ── Chunking parameters
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
TOP_K = 5

# ── Lazy singletons — initialised once on first use, not at import time.
_embeddings: HuggingFaceEmbeddings | None = None
_llm: ChatGoogleGenerativeAI | None = None


def _get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        logger.info("Loading HuggingFace embedding model (all-MiniLM-L6-v2)…")
        _embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        logger.info("Embedding model loaded.")
    return _embeddings


def _get_llm() -> ChatGoogleGenerativeAI:
    global _llm
    if _llm is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Add it to your .env file."
            )
        logger.info("Initialising Gemini 2.5 Flash LLM…")
        _llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=api_key,
            temperature=0,
        )
    return _llm


def _get_vectorstore() -> Chroma:
    return Chroma(
        collection_name=COLLECTION_NAME,
        embedding_function=_get_embeddings(),
        persist_directory=CHROMA_DIR,
    )


# ── INDEXING PIPELINE ────────────────────────────────────────────────────────

def index_document(file_path: str, filename: str) -> int:
    """Load, chunk, embed, and store one PDF. Appends to the existing collection."""
    logger.info("Indexing '%s'…", filename)

    loader = PyPDFLoader(file_path)
    pages = loader.load()
    logger.info("Loaded %d page(s) from '%s'.", len(pages), filename)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    chunks = splitter.split_documents(pages)
    logger.info("Split into %d chunk(s).", len(chunks))

    for chunk in chunks:
        chunk.metadata["source"] = filename

    vectorstore = _get_vectorstore()
    ids = [f"{filename}_chunk_{i}" for i in range(len(chunks))]
    vectorstore.add_documents(documents=chunks, ids=ids)

    logger.info("Stored %d chunk(s) for '%s'.", len(chunks), filename)
    return len(chunks)


# ── LIST DOCUMENTS ───────────────────────────────────────────────────────────

def list_documents() -> list[dict]:
    """Return a list of indexed files with their chunk counts."""
    vectorstore = _get_vectorstore()
    result = vectorstore.get(include=["metadatas"])

    counts: dict[str, int] = {}
    for meta in result["metadatas"]:
        source = meta.get("source", "unknown")
        counts[source] = counts.get(source, 0) + 1

    return [{"filename": name, "chunks": count} for name, count in counts.items()]


# ── DELETE DOCUMENT ──────────────────────────────────────────────────────────

def delete_document(filename: str) -> int:
    """Remove all chunks for one file from ChromaDB. Returns chunks deleted."""
    vectorstore = _get_vectorstore()

    result = vectorstore.get(
        where={"source": filename},
        include=["metadatas"],
    )

    ids_to_delete = result["ids"]
    if not ids_to_delete:
        logger.info("No chunks found for '%s' — nothing to delete.", filename)
        return 0

    vectorstore.delete(ids=ids_to_delete)
    logger.info("Deleted %d chunk(s) for '%s'.", len(ids_to_delete), filename)
    return len(ids_to_delete)


# ── QUERY PIPELINE ───────────────────────────────────────────────────────────

def query_rag(question: str) -> dict:
    """
    Run the full RAG query pipeline.

    Uses MMR retrieval to reduce redundant context chunks, then calls
    Gemini 2.5 Flash with an anti-hallucination prompt.
    """
    logger.info("RAG query: %r", question[:120])

    vectorstore = _get_vectorstore()

    # MMR retrieval: fetch_k=20 candidates, return k=5 maximally diverse ones.
    retriever = vectorstore.as_retriever(
        search_type="mmr",
        search_kwargs={"k": TOP_K, "fetch_k": 20, "lambda_mult": 0.7},
    )

    source_docs = retriever.invoke(question)
    logger.info("Retrieved %d source chunk(s).", len(source_docs))

    context = "\n\n".join(doc.page_content for doc in source_docs)

    prompt = ChatPromptTemplate.from_messages([
        (
            "system",
            "You are a helpful assistant that answers questions strictly based on "
            "the provided context.\n"
            "Use ONLY the information from the context below to answer the question.\n"
            "If the answer is not in the context, say: "
            "'I don't know based on the provided documents.'\n"
            "Do not make up information.\n\n"
            "Context:\n{context}",
        ),
        ("human", "{question}"),
    ])

    chain = prompt | _get_llm() | StrOutputParser()
    answer = chain.invoke({"context": context, "question": question})
    logger.info("LLM response generated (%d chars).", len(answer))

    sources = [
        {
            "text": doc.page_content[:300],
            "filename": doc.metadata.get("source", "?"),
            "page": doc.metadata.get("page", "?"),
        }
        for doc in source_docs
    ]

    return {"answer": answer, "sources": sources}
