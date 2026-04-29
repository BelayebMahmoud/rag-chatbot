import { useState, useRef, useEffect } from "react";
import axios from "axios";

// ── Design tokens ─────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:         #0a0a0f;
    --surface:    #111118;
    --surface2:   #1a1a24;
    --border:     #2a2a3a;
    --accent:     #6c63ff;
    --accent2:    #ff6584;
    --accent3:    #43e8b0;
    --text:       #e8e8f0;
    --text-muted: #6b6b80;
    --radius:     14px;
    --font-head:  'Syne', sans-serif;
    --font-mono:  'JetBrains Mono', monospace;
  }

  html, body, #root {
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-head);
    overflow: hidden;
  }

  /* scrollbar */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; } 50% { opacity: 0.3; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes gradientShift {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes blink {
    0%, 100% { opacity: 1; } 50% { opacity: 0; }
  }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────
const UploadIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const DocIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
  </svg>
);
const BotIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"/>
    <circle cx="12" cy="5" r="2"/>
    <path d="M12 7v4"/>
    <line x1="8" y1="16" x2="8" y2="16"/>
    <line x1="16" y1="16" x2="16" y2="16"/>
  </svg>
);
const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

// ── Sub-components ────────────────────────────────────────────────────────────

function SourceChip({ text, index }) {
  const [open, setOpen] = useState(false);
  const preview = text.slice(0, 60) + (text.length > 60 ? "…" : "");
  return (
    <div
      onClick={() => setOpen(o => !o)}
      style={{
        marginTop: "6px",
        padding: "6px 10px",
        background: "rgba(108,99,255,0.08)",
        border: "1px solid rgba(108,99,255,0.2)",
        borderRadius: "8px",
        cursor: "pointer",
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
        color: "var(--text-muted)",
        transition: "all 0.2s",
        lineHeight: 1.5,
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(108,99,255,0.5)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(108,99,255,0.2)"}
    >
      <span style={{ color: "var(--accent)", marginRight: "6px" }}>src_{index + 1}</span>
      {open ? text : preview}
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex",
      flexDirection: isUser ? "row-reverse" : "row",
      gap: "10px",
      animation: "fadeUp 0.3s ease",
      alignItems: "flex-start",
    }}>
      {/* Avatar */}
      <div style={{
        width: "32px", height: "32px",
        borderRadius: "10px",
        background: isUser
          ? "linear-gradient(135deg, #ff6584, #ff9a44)"
          : "linear-gradient(135deg, #6c63ff, #43e8b0)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
        boxShadow: isUser
          ? "0 0 12px rgba(255,101,132,0.3)"
          : "0 0 12px rgba(108,99,255,0.3)",
      }}>
        {isUser ? <UserIcon /> : <BotIcon />}
      </div>

      {/* Bubble */}
      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{
          padding: "12px 16px",
          borderRadius: isUser ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
          background: isUser ? "linear-gradient(135deg, #6c63ff22, #6c63ff11)" : "var(--surface2)",
          border: `1px solid ${isUser ? "rgba(108,99,255,0.3)" : "var(--border)"}`,
          fontSize: "14px",
          lineHeight: 1.65,
          color: "var(--text)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {msg.content}
        </div>

        {/* Sources */}
        {msg.sources && msg.sources.length > 0 && (
          <div style={{ paddingLeft: "4px" }}>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "4px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {msg.sources.length} source{msg.sources.length > 1 ? "s" : ""} retrieved
            </div>
            {msg.sources.map((s, i) => <SourceChip key={i} text={s} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", animation: "fadeUp 0.3s ease" }}>
      <div style={{
        width: "32px", height: "32px", borderRadius: "10px",
        background: "linear-gradient(135deg, #6c63ff, #43e8b0)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 12px rgba(108,99,255,0.3)",
      }}>
        <BotIcon />
      </div>
      <div style={{
        padding: "14px 18px",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: "4px 16px 16px 16px",
        display: "flex", gap: "5px", alignItems: "center",
      }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: "7px", height: "7px", borderRadius: "50%",
            background: "var(--accent)",
            animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [file, setFile]           = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState(null); // { filename, chunks }
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [thinking, setThinking]   = useState(false);
  const [error, setError]         = useState(null);
  const [dragOver, setDragOver]   = useState(false);

  const bottomRef  = useRef(null);
  const fileRef    = useRef(null);
  const inputRef   = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // ── Upload handler ──────────────────────────────────────────────────────────
  async function handleUpload(selectedFile) {
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported.");
      return;
    }
    setFile(selectedFile);
    setUploading(true);
    setError(null);
    setUploadInfo(null);
    setMessages([]);

    const form = new FormData();
    form.append("file", selectedFile);

    try {
      const { data } = await axios.post("/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadInfo({ filename: data.filename, chunks: data.chunks });
      setMessages([{
        role: "assistant",
        content: `Document indexed. I found ${data.chunks} text chunks ready to search.\n\nAsk me anything about "${data.filename}".`,
        sources: [],
      }]);
      inputRef.current?.focus();
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed. Is the backend running?");
      setFile(null);
    } finally {
      setUploading(false);
    }
  }

  // ── Chat handler ────────────────────────────────────────────────────────────
  async function handleSend() {
    const q = input.trim();
    if (!q || thinking || !uploadInfo) return;

    setMessages(m => [...m, { role: "user", content: q }]);
    setInput("");
    setThinking(true);
    setError(null);

    try {
      const { data } = await axios.post("/chat", { question: q });
      setMessages(m => [...m, {
        role: "assistant",
        content: data.answer,
        sources: data.sources || [],
      }]);
    } catch (err) {
      setError(err.response?.data?.detail || "Query failed. Please try again.");
    } finally {
      setThinking(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Drag-and-drop
  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleUpload(dropped);
  }

  const ready = !!uploadInfo && !uploading;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>

      {/* Background grid */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(108,99,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(108,99,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
        pointerEvents: "none",
      }} />

      {/* Glow orbs */}
      <div style={{
        position: "fixed", top: "-120px", left: "-120px",
        width: "500px", height: "500px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(108,99,255,0.06) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />
      <div style={{
        position: "fixed", bottom: "-100px", right: "-100px",
        width: "400px", height: "400px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(67,232,176,0.05) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* Shell */}
      <div style={{
        position: "relative", zIndex: 1,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        maxWidth: "860px",
        margin: "0 auto",
        padding: "0 16px",
      }}>

        {/* ── Header ── */}
        <header style={{
          padding: "20px 0 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontSize: "22px",
              fontWeight: 800,
              letterSpacing: "-0.5px",
              background: "linear-gradient(90deg, #6c63ff, #43e8b0)",
              backgroundSize: "200% 200%",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              animation: "gradientShift 4s ease infinite",
            }}>
              RAG Chatbot
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
              local embeddings · gemini 2.5 flash · chromadb
            </div>
          </div>

          {/* Status badge */}
          <div style={{
            display: "flex", alignItems: "center", gap: "7px",
            padding: "6px 12px",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: "99px",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: ready ? "var(--accent3)" : "var(--text-muted)",
          }}>
            <div style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: ready ? "var(--accent3)" : "var(--text-muted)",
              boxShadow: ready ? "0 0 6px var(--accent3)" : "none",
              animation: ready ? "pulse 2s ease infinite" : "none",
            }} />
            {uploading ? "indexing…" : ready ? "ready" : "no document"}
          </div>
        </header>

        {/* ── Upload bar ── */}
        <div style={{
          padding: "14px 0",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          {!uploadInfo ? (
            /* Drop zone */
            <div
              onClick={() => !uploading && fileRef.current.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                padding: "28px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                cursor: uploading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                background: dragOver ? "rgba(108,99,255,0.05)" : "transparent",
              }}
            >
              {uploading ? (
                <>
                  <div style={{
                    width: "28px", height: "28px",
                    border: "2px solid var(--border)",
                    borderTop: "2px solid var(--accent)",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }} />
                  <span style={{ fontSize: "13px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    indexing {file?.name}…
                  </span>
                </>
              ) : (
                <>
                  <div style={{ color: "var(--accent)", opacity: 0.8 }}><UploadIcon /></div>
                  <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                    Drop a PDF here or <span style={{ color: "var(--accent)", textDecoration: "underline" }}>browse</span>
                  </div>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                style={{ display: "none" }}
                onChange={e => handleUpload(e.target.files[0])}
              />
            </div>
          ) : (
            /* Uploaded file chip */
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 16px",
              background: "rgba(67,232,176,0.06)",
              border: "1px solid rgba(67,232,176,0.2)",
              borderRadius: "var(--radius)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ color: "var(--accent3)" }}><DocIcon /></div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text)" }}>
                    {uploadInfo.filename}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {uploadInfo.chunks} chunks indexed ✓
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setUploadInfo(null);
                  setFile(null);
                  setMessages([]);
                  setError(null);
                }}
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text-muted)",
                  fontSize: "11px",
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                }}
              >
                replace
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop: "8px",
              padding: "8px 14px",
              background: "rgba(255,101,132,0.08)",
              border: "1px solid rgba(255,101,132,0.25)",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#ff6584",
              fontFamily: "var(--font-mono)",
            }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* ── Messages ── */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 0",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}>
          {messages.length === 0 && !uploading && (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: "12px", opacity: 0.4, userSelect: "none",
            }}>
              <div style={{ fontSize: "40px" }}>◈</div>
              <div style={{ fontSize: "13px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                upload a document to begin
              </div>
            </div>
          )}

          {messages.map((msg, i) => <Message key={i} msg={msg} />)}
          {thinking && <ThinkingBubble />}
          <div ref={bottomRef} />
        </div>

        {/* ── Input bar ── */}
        <div style={{
          padding: "14px 0 20px",
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
        }}>
          <div style={{
            display: "flex",
            gap: "10px",
            alignItems: "flex-end",
            background: "var(--surface2)",
            border: `1px solid ${ready && !thinking ? "var(--border)" : "var(--border)"}`,
            borderRadius: "var(--radius)",
            padding: "10px 12px",
            transition: "border-color 0.2s",
          }}
            onFocus={() => {}}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={!ready || thinking}
              placeholder={
                !uploadInfo ? "Upload a PDF first…" :
                thinking     ? "Thinking…" :
                               "Ask anything about your document…"
              }
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text)",
                fontSize: "14px",
                fontFamily: "var(--font-head)",
                resize: "none",
                lineHeight: 1.6,
                maxHeight: "120px",
                overflowY: "auto",
                opacity: ready ? 1 : 0.4,
              }}
              onInput={e => {
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={handleSend}
              disabled={!ready || thinking || !input.trim()}
              style={{
                width: "36px", height: "36px",
                borderRadius: "10px",
                border: "none",
                background: ready && input.trim() && !thinking
                  ? "linear-gradient(135deg, var(--accent), #43e8b0)"
                  : "var(--border)",
                color: "white",
                cursor: ready && input.trim() && !thinking ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.2s",
                boxShadow: ready && input.trim() && !thinking
                  ? "0 0 16px rgba(108,99,255,0.4)" : "none",
              }}
            >
              <SendIcon />
            </button>
          </div>
          <div style={{
            marginTop: "8px",
            fontSize: "10px",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
            textAlign: "center",
          }}>
            Enter to send · Shift+Enter for new line · click source chips to expand
          </div>
        </div>
      </div>
    </>
  );
}