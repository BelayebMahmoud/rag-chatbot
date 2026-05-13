// ============================================================
// App.jsx  —  Multi-File RAG Chatbot Frontend
// CHANGES vs single-file version:
//   - Left sidebar shows all indexed documents with chunk counts
//   - Each document has an ❌ remove button (calls DELETE /documents/{filename})
//   - On page load, GET /documents restores the list (survives refresh)
//   - Chat is enabled when at least ONE document is indexed
//   - Sources in AI messages show filename + page number
//   - Upload area accepts multiple files at once (uploads sequentially)
// ============================================================

import { useState, useEffect, useRef } from "react";
import axios from "axios";

const API = "http://localhost:8000";

// ── Sub-components ───────────────────────────────────────────

function DocumentItem({ doc, onDelete, disabled }) {
  return (
    <div style={styles.docItem}>
      <div>
        <div style={styles.docName} title={doc.filename}>
          📄 {doc.filename.length > 22
            ? doc.filename.slice(0, 20) + "…"
            : doc.filename}
        </div>
        <div style={styles.docChunks}>{doc.chunks} chunks</div>
      </div>
      <button
        onClick={() => onDelete(doc.filename)}
        disabled={disabled}
        style={styles.deleteBtn}
        title={`Remove ${doc.filename}`}
      >
        ❌
      </button>
    </div>
  );
}

function ChatMessage({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ ...styles.msgWrapper, justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={isUser ? styles.userBubble : styles.aiBubble}>
        <div>{msg.content}</div>

        {/* Source attribution — only on AI messages that have sources */}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div style={styles.sources}>
            <div style={styles.sourcesLabel}>📚 Sources used:</div>
            {msg.sources.map((s, i) => (
              <div key={i} style={styles.sourceChip}>
                <strong>{s.filename}</strong>
                {s.page !== "?" && ` · page ${Number(s.page) + 1}`}
                <br />
                <span style={styles.sourceText}>
                  "{s.text.slice(0, 120)}{s.text.length > 120 ? "…" : ""}"
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────

export default function App() {
  const [documents, setDocuments]   = useState([]);   // [{filename, chunks}]
  const [messages, setMessages]     = useState([]);   // [{role, content, sources?}]
  const [question, setQuestion]     = useState("");
  const [uploading, setUploading]   = useState(false);
  const [thinking, setThinking]     = useState(false);
  const [statusMsg, setStatusMsg]   = useState("");   // transient feedback
  const fileInputRef                = useRef(null);
  const chatBottomRef               = useRef(null);

  const hasDocuments = documents.length > 0;

  // ── On mount: restore document list from backend ────────────
  useEffect(() => {
    fetchDocuments();
  }, []);

  // ── Auto-scroll chat to bottom ──────────────────────────────
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // ── API helpers ─────────────────────────────────────────────
  async function fetchDocuments() {
    try {
      const res = await axios.get(`${API}/documents`);
      setDocuments(res.data);
    } catch {
      // Backend not ready yet — fail silently
    }
  }

  async function handleUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setUploading(true);
    setStatusMsg(`Uploading ${files.length} file(s)…`);

    // Upload files sequentially to avoid rate limit spikes
    let successCount = 0;
    const errors     = [];

    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        setStatusMsg(`Indexing ${file.name}…`);
        const res = await axios.post(`${API}/upload`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        successCount++;
        setStatusMsg(`✅ ${res.data.message}`);
      } catch (err) {
        const detail = err.response?.data?.detail || err.message;
        errors.push(`${file.name}: ${detail}`);
      }
    }

    // Refresh document list after all uploads
    await fetchDocuments();
    setUploading(false);

    if (errors.length > 0) {
      setStatusMsg(`⚠️ ${successCount} uploaded. Errors: ${errors.join(" | ")}`);
    } else {
      setStatusMsg(`✅ ${successCount} file(s) indexed successfully.`);
    }

    // Reset file input so same file can be re-selected after deletion
    e.target.value = "";
  }

  async function handleDelete(filename) {
    if (!window.confirm(`Remove "${filename}" from the index?`)) return;
    setStatusMsg(`Removing ${filename}…`);
    try {
      await axios.delete(`${API}/documents/${encodeURIComponent(filename)}`);
      await fetchDocuments();
      setStatusMsg(`🗑️ "${filename}" removed.`);
    } catch (err) {
      setStatusMsg(`❌ Failed to remove: ${err.response?.data?.detail || err.message}`);
    }
  }

  async function handleSend() {
    const q = question.trim();
    if (!q || !hasDocuments || thinking) return;

    const userMsg = { role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    setThinking(true);

    try {
      const res = await axios.post(`${API}/chat`, { question: q });
      const aiMsg = {
        role: "assistant",
        content: res.data.answer,
        sources: res.data.sources,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      const detail = err.response?.data?.detail || "Something went wrong.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Error: ${detail}` },
      ]);
    } finally {
      setThinking(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={styles.root}>

      {/* ── LEFT SIDEBAR — Document Manager ─────────────────── */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTitle}>📂 Documents</div>

        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={styles.uploadBtn}
        >
          {uploading ? "Uploading…" : "+ Upload PDF(s)"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple              // ← allows selecting multiple files at once
          style={{ display: "none" }}
          onChange={handleUpload}
        />

        {/* Status message */}
        {statusMsg && (
          <div style={styles.statusMsg}>{statusMsg}</div>
        )}

        {/* Document list */}
        {documents.length === 0 ? (
          <div style={styles.emptyDocs}>No documents indexed yet.</div>
        ) : (
          <div style={styles.docList}>
            {documents.map((doc) => (
              <DocumentItem
                key={doc.filename}
                doc={doc}
                onDelete={handleDelete}
                disabled={uploading || thinking}
              />
            ))}
          </div>
        )}

        {/* Total summary */}
        {documents.length > 0 && (
          <div style={styles.totalSummary}>
            {documents.length} file(s) ·{" "}
            {documents.reduce((sum, d) => sum + d.chunks, 0)} total chunks
          </div>
        )}
      </aside>

      {/* ── RIGHT PANEL — Chat ───────────────────────────────── */}
      <main style={styles.chatPanel}>
        <div style={styles.chatHeader}>
          🤖 RAG Chatbot{" "}
          {hasDocuments
            ? `— searching across ${documents.length} document(s)`
            : "— upload a PDF to begin"}
        </div>

        {/* Message thread */}
        <div style={styles.messageThread}>
          {messages.length === 0 && (
            <div style={styles.placeholder}>
              {hasDocuments
                ? "Ask a question about your documents."
                : "Upload one or more PDFs on the left to get started."}
            </div>
          )}
          {messages.map((msg, i) => (
            <ChatMessage key={i} msg={msg} />
          ))}
          {thinking && (
            <div style={{ ...styles.msgWrapper, justifyContent: "flex-start" }}>
              <div style={styles.aiBubble}>🤔 Thinking…</div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Input row */}
        <div style={styles.inputRow}>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              hasDocuments
                ? "Ask a question… (Enter to send)"
                : "Upload a PDF first"
            }
            disabled={!hasDocuments || thinking}
            rows={2}
            style={styles.textarea}
          />
          <button
            onClick={handleSend}
            disabled={!hasDocuments || thinking || !question.trim()}
            style={styles.sendBtn}
          >
            Send
          </button>
        </div>
      </main>
    </div>
  );
}

// ── Inline styles ─────────────────────────────────────────────
// Kept inline for simplicity — move to App.css if preferred.
const styles = {
  root: {
    display: "flex",
    height: "100vh",
    fontFamily: "system-ui, sans-serif",
    background: "#f0f2f5",
  },

  /* Sidebar */
  sidebar: {
    width: 260,
    minWidth: 220,
    background: "#1e1e2e",
    color: "#cdd6f4",
    display: "flex",
    flexDirection: "column",
    padding: "20px 14px",
    gap: 10,
    overflowY: "auto",
  },
  sidebarTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 6,
    color: "#cba6f7",
  },
  uploadBtn: {
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "10px 0",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
    width: "100%",
  },
  statusMsg: {
    fontSize: 12,
    color: "#a6e3a1",
    wordBreak: "break-word",
    lineHeight: 1.5,
  },
  emptyDocs: {
    fontSize: 13,
    color: "#6c7086",
    marginTop: 8,
    textAlign: "center",
  },
  docList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 4,
  },
  docItem: {
    background: "#313244",
    borderRadius: 8,
    padding: "8px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  docName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#cdd6f4",
    wordBreak: "break-all",
  },
  docChunks: {
    fontSize: 11,
    color: "#7f849c",
    marginTop: 2,
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    padding: 2,
    flexShrink: 0,
  },
  totalSummary: {
    fontSize: 12,
    color: "#7f849c",
    marginTop: 4,
    textAlign: "center",
  },

  /* Chat panel */
  chatPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  chatHeader: {
    background: "#fff",
    padding: "14px 20px",
    fontWeight: 700,
    fontSize: 15,
    borderBottom: "1px solid #e0e0e0",
    color: "#1e1e2e",
  },
  messageThread: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  placeholder: {
    textAlign: "center",
    color: "#aaa",
    marginTop: 60,
    fontSize: 15,
  },
  msgWrapper: {
    display: "flex",
  },
  userBubble: {
    background: "#7c3aed",
    color: "#fff",
    borderRadius: "18px 18px 4px 18px",
    padding: "10px 16px",
    maxWidth: "70%",
    fontSize: 14,
    lineHeight: 1.5,
  },
  aiBubble: {
    background: "#fff",
    color: "#1e1e2e",
    border: "1px solid #e0e0e0",
    borderRadius: "18px 18px 18px 4px",
    padding: "10px 16px",
    maxWidth: "75%",
    fontSize: 14,
    lineHeight: 1.6,
  },
  sources: {
    marginTop: 10,
    borderTop: "1px solid #e8e8e8",
    paddingTop: 8,
  },
  sourcesLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: "#7c3aed",
    marginBottom: 6,
  },
  sourceChip: {
    background: "#f5f0ff",
    borderRadius: 6,
    padding: "6px 10px",
    marginBottom: 4,
    fontSize: 12,
    color: "#444",
  },
  sourceText: {
    color: "#777",
    fontStyle: "italic",
  },

  /* Input */
  inputRow: {
    display: "flex",
    gap: 10,
    padding: "14px 20px",
    background: "#fff",
    borderTop: "1px solid #e0e0e0",
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    resize: "none",
    border: "1px solid #d0d0d0",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    lineHeight: 1.5,
  },
  sendBtn: {
    background: "#7c3aed",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "10px 22px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    height: 44,
  },
};