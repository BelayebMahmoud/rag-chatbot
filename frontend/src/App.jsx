import { useState, useRef, useEffect } from "react";
import axios from "axios";

/* ─────────────────────────────────────────────
  Global styles — warm editorial direction
  Fraunces (expressive serif) + DM Sans (clean)
───────────────────────────────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,600;1,9..144,300&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --paper:      #f7f4ef;
    --paper-dark: #eee9e0;
    --ink:        #1c1814;
    --ink-mid:    #6b6459;
    --ink-light:  #a8a099;
    --rule:       #ddd7ce;
    --accent:     #c4622d;
    --accent-bg:  #fdf1eb;
    --green:      #2d6a4f;
    --green-bg:   #edf6f0;
    --red:        #9b2335;
    --red-bg:     #fdf0f2;
    --user-bg:    #1c1814;
    --user-ink:   #f7f4ef;
    --radius-sm:  6px;
    --radius-md:  12px;
    --radius-lg:  20px;
    --shadow-sm:  0 1px 3px rgba(28,24,20,0.08);
    --shadow-md:  0 4px 16px rgba(28,24,20,0.10);
  }

  html, body, #root {
    height: 100%;
    background: var(--paper);
    color: var(--ink);
    font-family: 'DM Sans', sans-serif;
    font-size: 15px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  ::selection {
    background: #f0d5c8;
  }

  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 99px; }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes blink {
    0%,100% { opacity: 1; } 50% { opacity: 0; }
  }
  @keyframes fadeIn {
    from { opacity: 0; } to { opacity: 1; }
  }

  textarea:focus { outline: none; }
  button { cursor: pointer; font-family: 'DM Sans', sans-serif; }
`;

/* ─────────────────────────────────────────────
  Small SVG icons — simple strokes, no fill
───────────────────────────────────────────── */
const Icon = {
  upload: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  send: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  file: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
  chevron: (open) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  x: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
};

/* ─────────────────────────────────────────────
  Source accordion chip
───────────────────────────────────────────── */
function SourceCard({ text, index }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={() => setOpen(o => !o)}
      style={{
        marginTop: "6px",
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        cursor: "pointer",
        background: "var(--paper)",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--ink-light)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--rule)"}
    >
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 11px",
        fontSize: "12px",
        color: "var(--ink-mid)",
        fontFamily: "'DM Mono', monospace",
        userSelect: "none",
      }}>
        <span style={{ color: "var(--accent)", marginRight: "8px" }}>¶ {index + 1}</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {text.slice(0, 55)}{text.length > 55 ? "…" : ""}
        </span>
        <span style={{ marginLeft: "8px", color: "var(--ink-light)" }}>
          {Icon.chevron(open)}
        </span>
      </div>
      {open && (
        <div style={{
          padding: "10px 12px",
          borderTop: "1px solid var(--rule)",
          fontSize: "12px",
          lineHeight: 1.7,
          color: "var(--ink-mid)",
          fontFamily: "'DM Mono', monospace",
          background: "var(--paper-dark)",
          animation: "fadeIn 0.15s ease",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {text}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
  Chat message bubble
───────────────────────────────────────────── */
function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: isUser ? "flex-end" : "flex-start",
      animation: "slideUp 0.25s ease",
      gap: "6px",
    }}>
      {/* Role label */}
      <div style={{
        fontSize: "11px",
        color: "var(--ink-light)",
        fontFamily: "'DM Mono', monospace",
        letterSpacing: "0.06em",
        paddingInline: "4px",
      }}>
        {isUser ? "you" : "assistant"}
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: "78%",
        padding: "13px 17px",
        borderRadius: isUser
          ? "var(--radius-lg) var(--radius-sm) var(--radius-lg) var(--radius-lg)"
          : "var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)",
        background: isUser ? "var(--user-bg)" : "white",
        color: isUser ? "var(--user-ink)" : "var(--ink)",
        border: isUser ? "none" : "1px solid var(--rule)",
        fontSize: "14px",
        lineHeight: 1.7,
        boxShadow: "var(--shadow-sm)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {msg.content}
      </div>

      {/* Sources */}
      {msg.sources?.length > 0 && (
        <div style={{ maxWidth: "78%", width: "100%", paddingInline: "2px" }}>
          <div style={{
            fontSize: "11px",
            color: "var(--ink-light)",
            fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.06em",
            marginBottom: "4px",
            paddingInline: "2px",
          }}>
            {msg.sources.length} passage{msg.sources.length > 1 ? "s" : ""} retrieved
          </div>
          {msg.sources.map((s, i) => <SourceCard key={i} text={s} index={i} />)}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
  Typing indicator
───────────────────────────────────────────── */
function Thinking() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start", animation: "slideUp 0.2s ease" }}>
      <div style={{ fontSize: "11px", color: "var(--ink-light)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.06em", paddingInline: "4px" }}>
        assistant
      </div>
      <div style={{
        padding: "14px 18px",
        background: "white",
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)",
        display: "flex", gap: "5px", alignItems: "center",
        boxShadow: "var(--shadow-sm)",
      }}>
        {[0, 0.18, 0.36].map((delay, i) => (
          <div key={i} style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: "var(--ink-light)",
            animation: `blink 1.1s ease-in-out ${delay}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
  Main App
───────────────────────────────────────────── */
export default function App() {
  const [file, setFile]         = useState(null);
  const [uploading, setUploading] = useState(false);
  const [docInfo, setDocInfo]   = useState(null);   // { filename, chunks }
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError]       = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const bottomRef = useRef(null);
  const fileRef   = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  /* Upload */
  async function handleUpload(selected) {
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }
    setFile(selected);
    setUploading(true);
    setError(null);
    setDocInfo(null);
    setMessages([]);

    const form = new FormData();
    form.append("file", selected);

    try {
      const { data } = await axios.post("/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDocInfo({ filename: data.filename, chunks: data.chunks });
      setMessages([{
        role: "assistant",
        content: `Ready. I've indexed ${data.chunks} passages from "${data.filename}".\n\nWhat would you like to know?`,
        sources: [],
      }]);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed — is the backend running?");
      setFile(null);
    } finally {
      setUploading(false);
    }
  }

  /* Chat */
  async function handleSend() {
    const q = input.trim();
    if (!q || thinking || !docInfo) return;

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
      setError(err.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setThinking(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleUpload(f);
  }

  const ready = !!docInfo && !uploading;

  /* ── Render ── */
  return (
    <>
      <style>{GLOBAL_CSS}</style>

      <div style={{
        height: "100vh",
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        gridTemplateRows: "1fr",
        maxWidth: "1100px",
        margin: "0 auto",
        borderInline: "1px solid var(--rule)",
      }}>

        {/* ── LEFT SIDEBAR ── */}
        <aside style={{
          borderRight: "1px solid var(--rule)",
          display: "flex",
          flexDirection: "column",
          background: "var(--paper-dark)",
          overflow: "hidden",
        }}>

          {/* Brand */}
          <div style={{
            padding: "28px 24px 20px",
            borderBottom: "1px solid var(--rule)",
          }}>
            <div style={{
              fontFamily: "'Fraunces', serif",
              fontSize: "22px",
              fontWeight: 600,
              lineHeight: 1.1,
              color: "var(--ink)",
              letterSpacing: "-0.3px",
            }}>
              Document<br />
              <span style={{ color: "var(--accent)" }}>Q&A</span>
            </div>
            <div style={{
              marginTop: "8px",
              fontSize: "12px",
              color: "var(--ink-light)",
              fontFamily: "'DM Mono', monospace",
            }}>
              rag-powered · local embeddings
            </div>
          </div>

          {/* Upload section */}
          <div style={{ padding: "20px 20px 16px" }}>
            <div style={{
              fontSize: "10px",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--ink-light)",
              marginBottom: "10px",
              fontWeight: 500,
            }}>
              Document
            </div>

            {!docInfo ? (
              <div
                onClick={() => !uploading && fileRef.current.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                style={{
                  border: `1.5px dashed ${dragOver ? "var(--accent)" : "var(--rule)"}`,
                  borderRadius: "var(--radius-md)",
                  padding: "24px 16px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  cursor: uploading ? "wait" : "pointer",
                  background: dragOver ? "var(--accent-bg)" : "transparent",
                  transition: "all 0.15s",
                  textAlign: "center",
                }}
              >
                {uploading ? (
                  <>
                    <div style={{
                      width: "22px", height: "22px",
                      border: "2px solid var(--rule)",
                      borderTop: `2px solid var(--accent)`,
                      borderRadius: "50%",
                      animation: "spin 0.75s linear infinite",
                    }} />
                    <div style={{ fontSize: "12px", color: "var(--ink-mid)" }}>
                      indexing…
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ color: "var(--ink-mid)" }}>{Icon.upload}</div>
                    <div style={{ fontSize: "12px", color: "var(--ink-mid)", lineHeight: 1.5 }}>
                      Drop a PDF or{" "}
                      <span style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: "2px" }}>
                        click to browse
                      </span>
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
              <div style={{
                background: "var(--green-bg)",
                border: "1px solid #b7dfc9",
                borderRadius: "var(--radius-md)",
                padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <div style={{ color: "var(--green)", marginTop: "1px", flexShrink: 0 }}>{Icon.file}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "var(--ink)",
                      wordBreak: "break-all",
                      lineHeight: 1.4,
                    }}>
                      {docInfo.filename}
                    </div>
                    <div style={{
                      marginTop: "3px",
                      fontSize: "11px",
                      color: "var(--ink-mid)",
                      fontFamily: "'DM Mono', monospace",
                    }}>
                      {docInfo.chunks} passages indexed
                    </div>
                  </div>
                  <button
                    onClick={() => { setDocInfo(null); setFile(null); setMessages([]); setError(null); }}
                    style={{
                      background: "none", border: "none",
                      color: "var(--ink-light)",
                      padding: "2px", flexShrink: 0,
                      display: "flex", alignItems: "center",
                    }}
                    title="Remove document"
                  >
                    {Icon.x}
                  </button>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                marginTop: "10px",
                padding: "10px 12px",
                background: "var(--red-bg)",
                border: "1px solid #e8b4bb",
                borderRadius: "var(--radius-sm)",
                fontSize: "12px",
                color: "var(--red)",
                lineHeight: 1.5,
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Status */}
          <div style={{ padding: "0 20px", marginTop: "auto", paddingBottom: "24px" }}>
            <div style={{
              padding: "10px 14px",
              background: "white",
              border: "1px solid var(--rule)",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <div style={{
                width: "7px", height: "7px", borderRadius: "50%",
                background: ready ? "var(--green)" : uploading ? "var(--accent)" : "var(--ink-light)",
                flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--ink)" }}>
                  {uploading ? "Indexing" : ready ? "Ready" : "Waiting"}
                </div>
                <div style={{ fontSize: "10px", color: "var(--ink-light)", fontFamily: "'DM Mono', monospace" }}>
                  {uploading ? "processing chunks…" : ready ? "gemini 2.5 flash" : "upload a document"}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── RIGHT CHAT PANEL ── */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          background: "var(--paper)",
        }}>

          {/* Top bar */}
          <div style={{
            padding: "18px 28px",
            borderBottom: "1px solid var(--rule)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexShrink: 0,
          }}>
            <div style={{
              fontFamily: "'Fraunces', serif",
              fontSize: "15px",
              color: "var(--ink-mid)",
              fontStyle: "italic",
              fontWeight: 300,
            }}>
              {docInfo ? `Ask about — ${docInfo.filename}` : "No document loaded"}
            </div>
          </div>

          {/* Messages area */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "28px 32px",
            display: "flex",
            flexDirection: "column",
            gap: "24px",
          }}>
            {messages.length === 0 && !uploading && (
              <div style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "16px",
                opacity: 0.35,
                userSelect: "none",
                minHeight: "300px",
              }}>
                <div style={{
                  fontFamily: "'Fraunces', serif",
                  fontSize: "48px",
                  lineHeight: 1,
                  fontStyle: "italic",
                  color: "var(--ink)",
                  fontWeight: 300,
                }}>
                  ?
                </div>
                <div style={{ fontSize: "13px", color: "var(--ink-mid)", textAlign: "center", lineHeight: 1.6 }}>
                  Upload a document on the left<br/>then ask anything about it
                </div>
              </div>
            )}

            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {thinking && <Thinking />}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={{
            padding: "16px 28px 20px",
            borderTop: "1px solid var(--rule)",
            flexShrink: 0,
            background: "white",
          }}>
            <div style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-end",
              border: `1.5px solid ${ready && !thinking ? "var(--ink)" : "var(--rule)"}`,
              borderRadius: "var(--radius-md)",
              padding: "10px 12px 10px 16px",
              transition: "border-color 0.2s",
              background: "white",
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                disabled={!ready || thinking}
                placeholder={
                  !docInfo  ? "Upload a document to begin…" :
                  thinking  ? "Waiting for response…" :
                              "Ask a question about your document…"
                }
                rows={1}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "var(--ink)",
                  fontSize: "14px",
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 400,
                  resize: "none",
                  lineHeight: 1.6,
                  maxHeight: "130px",
                  overflowY: "auto",
                  opacity: ready ? 1 : 0.5,
                }}
                onInput={e => {
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 130) + "px";
                }}
              />
              <button
                onClick={handleSend}
                disabled={!ready || thinking || !input.trim()}
                style={{
                  width: "34px", height: "34px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: ready && input.trim() && !thinking
                    ? "var(--ink)"
                    : "var(--rule)",
                  color: ready && input.trim() && !thinking
                    ? "var(--paper)"
                    : "var(--ink-light)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.15s",
                }}
              >
                {Icon.send}
              </button>
            </div>

            <div style={{
              marginTop: "8px",
              fontSize: "11px",
              color: "var(--ink-light)",
              fontFamily: "'DM Mono', monospace",
              textAlign: "right",
            }}>
              ↵ send · shift+↵ new line
            </div>
          </div>
        </div>
      </div>
    </>
  );
}