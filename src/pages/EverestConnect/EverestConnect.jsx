import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import {
    Bot,
    MessagesSquare,
    Search,
    Folder,
    FolderOpen,
    ChevronDown,
    ChevronRight,
    Plus,
    UserPlus,
    Link2,
    CheckCheck,
    Check,
    FileText,
    ArrowLeft,
    X,
    Send,
    RefreshCw,
    Smartphone,
    LogOut,
    Image as ImageIcon,
    Mic,
    Video,
    MapPin
} from "lucide-react";
import Banner from "../../components/Banner/Banner.jsx";
import { auth } from "../../components/firebase";
import { apiFetch } from "../../api/apiClient";
import { authHeaders } from "../../components/SalesOrder/QuotationWise/quotationUtils";
import "./EverestConnect.css";

const API = "/serverphp/whatsapp_inbox.php";
const COLLECTIONS_KEY = "everest_connect_collections_v1";

// ---------- helpers ----------

async function callApi(action, body = {}) {
    const response = await apiFetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action, ...body })
    });
    let data = {};
    try {
        data = await response.json();
    } catch {
        // not JSON
    }
    if (!response.ok || data.success === false) {
        const error = new Error(data.message || `Request failed (${response.status})`);
        error.data = data;
        throw error;
    }
    return data;
}

const digitsOnly = (value) => String(value || "").replace(/\D/g, "");
const last10 = (value) => digitsOnly(value).slice(-10);

const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? null : date;
};

const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const formatListTime = (value) => {
    const date = parseDate(value);
    if (!date) return "";
    const now = new Date();
    if (sameDay(date, now)) return date.toTimeString().slice(0, 5);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, yesterday)) return "Yesterday";
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

const formatDay = (value) => {
    const date = parseDate(value);
    if (!date) return "";
    const now = new Date();
    if (sameDay(date, now)) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (sameDay(date, yesterday)) return "Yesterday";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const initialsOf = (name) => {
    const clean = String(name || "").replace(/[^A-Za-z0-9 ]/g, " ").trim();
    if (!clean) return "?";
    const parts = clean.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
};

const AVATAR_COLORS = ["#d9f99d", "#fde68a", "#bfdbfe", "#fbcfe8", "#c7d2fe", "#a7f3d0", "#fed7aa", "#ddd6fe"];

const avatarColor = (key) => {
    let hash = 0;
    for (const ch of String(key)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const chatName = (chat) => chat?.name || (chat?.mobile ? `+${chat.mobile}` : "Unknown");

const chatKey = (chat) => `${chat.account_uid || ""}|${chat.jid}`;

const loadJson = (key, fallback) => {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "null");
        return value ?? fallback;
    } catch {
        return fallback;
    }
};

const saveJson = (key, value) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // storage unavailable
    }
};

const TYPE_ICON = {
    image: ImageIcon,
    video: Video,
    audio: Mic,
    document: FileText,
    location: MapPin
};

const TYPE_LABEL = {
    image: "Photo",
    video: "Video",
    audio: "Voice message",
    sticker: "Sticker",
    contact: "Contact",
    location: "Location"
};

// ---------- small pieces ----------

const WhatsappGlyph = () => (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.2-.2-.4-.3z" />
    </svg>
);

const Avatar = ({ name, seed, size = 48 }) => (
    <div className="ec-avatar" style={{ width: size, height: size, background: avatarColor(seed || name), fontSize: size * 0.36 }}>
        {initialsOf(name)}
        <span className="ec-avatar-badge" title="WhatsApp">
            <WhatsappGlyph />
        </span>
    </div>
);

// Picture on the empty / connect screens. Uses src/assets/everest-connect-ai.(jpg|png|webp)
// when that file exists; otherwise the built-in drawing below.
const ART_FILES = import.meta.glob("../../assets/everest-connect-ai.{jpg,jpeg,png,webp}", {
    eager: true,
    import: "default"
});
const connectArt = Object.values(ART_FILES)[0];

const RING_NODES = Array.from({ length: 12 }, (_, i) => (i * Math.PI * 2) / 12);

const ConnectArtwork = () => (
    <svg viewBox="0 0 480 270" role="presentation">
        <defs>
            <radialGradient id="ecGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.55" />
                <stop offset="60%" stopColor="#1d4ed8" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#070d1e" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="ecBubble" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
            <filter id="ecBlur" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="9" />
            </filter>
        </defs>
        <rect width="480" height="270" rx="20" fill="#081127" />
        <rect width="480" height="270" rx="20" fill="url(#ecGlow)" />
        {[[70, 60], [410, 70], [60, 200], [420, 205], [240, 18]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="18" fill="#2563eb" opacity="0.4" filter="url(#ecBlur)" />
        ))}
        <g fill="none" stroke="#60a5fa">
            <circle cx="240" cy="135" r="122" strokeOpacity="0.35" />
            <circle cx="240" cy="135" r="104" strokeOpacity="0.55" strokeDasharray="10 7" />
            <circle cx="240" cy="135" r="84" strokeOpacity="0.45" />
            <circle cx="240" cy="135" r="66" strokeOpacity="0.6" strokeDasharray="22 10" strokeWidth="5" />
        </g>
        <g stroke="#e0f2fe" strokeOpacity="0.55">
            {RING_NODES.map((a, i) => (
                <line key={i} x1={240 + Math.cos(a) * 66} y1={135 + Math.sin(a) * 66} x2={240 + Math.cos(a) * 122} y2={135 + Math.sin(a) * 122} />
            ))}
        </g>
        <g fill="#f0f9ff">
            {RING_NODES.map((a, i) => (
                <React.Fragment key={i}>
                    <circle cx={240 + Math.cos(a) * 104} cy={135 + Math.sin(a) * 104} r="3.2" />
                    <circle cx={240 + Math.cos(a + 0.26) * 122} cy={135 + Math.sin(a + 0.26) * 122} r="2.4" opacity="0.8" />
                </React.Fragment>
            ))}
        </g>
        <path d="M200 95 h80 a14 14 0 0 1 14 14 v40 a14 14 0 0 1 -14 14 h-44 l-18 16 v-16 h-18 a14 14 0 0 1 -14 -14 v-40 a14 14 0 0 1 14 -14 z" fill="url(#ecBubble)" />
        <g stroke="#0b1533" strokeOpacity="0.55" strokeWidth="2" fill="none" strokeLinecap="round">
            <path d="M206 112 h14 v10 h10" />
            <path d="M206 146 h18 v-10 h8" />
            <path d="M274 112 h-14 v10 h-10" />
            <path d="M274 146 h-18 v-10 h-8" />
        </g>
        <rect x="229" y="118" width="22" height="22" rx="4" fill="#0b1533" />
        <text x="240" y="133.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#93c5fd" fontFamily="Inter, Segoe UI, sans-serif">AI</text>
        <g fill="#0b1533">
            <circle cx="206" cy="112" r="2.5" />
            <circle cx="206" cy="146" r="2.5" />
            <circle cx="274" cy="112" r="2.5" />
            <circle cx="274" cy="146" r="2.5" />
        </g>
    </svg>
);

const Orbit = () => (
    <div className="ec-art" aria-hidden="true">
        {connectArt ? <img src={connectArt} alt="" /> : <ConnectArtwork />}
    </div>
);

// QR code / connection status for the logged-in user's own WhatsApp.
function ConnectPanel({ wa, busy, onConnect, onLogout, onStartChat, onRetry, hasChats }) {
    const status = wa?.status || "loading";

    if (status === "service_offline") {
        return (
            <div className="ec-empty">
                <Orbit />
                <h2>WhatsApp service is offline</h2>
                <p>
                    The WhatsApp link program is not running on the server yet. The admin starts it once on
                    the server (double-click <b>start-whatsapp-service.bat</b> in the whatsapp-service folder).
                    Then you can scan the QR code here with your phone, like WhatsApp Web.
                </p>
                <button type="button" className="ec-btn-primary" onClick={onRetry}>
                    <RefreshCw size={14} /> Check again
                </button>
            </div>
        );
    }

    if (status === "qr" && wa.qr) {
        return (
            <div className="ec-empty">
                <div className="ec-qr">
                    <img src={wa.qr} alt="WhatsApp QR code" width="260" height="260" />
                </div>
                <h2>Scan to link your WhatsApp</h2>
                <ol className="ec-steps">
                    <li>Open WhatsApp on your phone</li>
                    <li>Tap <b>Menu ⋮</b> or <b>Settings</b> → <b>Linked devices</b></li>
                    <li>Tap <b>Link a device</b> and point your phone at this code</li>
                </ol>
                <button type="button" className="ec-btn-ghost" onClick={onLogout} disabled={busy}>
                    Cancel
                </button>
            </div>
        );
    }

    if (status === "connecting" || status === "starting" || status === "loading") {
        return (
            <div className="ec-empty">
                <Orbit />
                <h2>{status === "loading" ? "Loading…" : "Connecting to WhatsApp…"}</h2>
                <p>{wa?.error && status === "connecting" ? "Retrying the connection…" : "This takes a few seconds."}</p>
                {wa?.error && status === "connecting" && (
                    <p className="ec-error-detail">Last error from WhatsApp: {wa.error}</p>
                )}
                {status !== "loading" && (
                    <button type="button" className="ec-btn-ghost" onClick={onLogout} disabled={busy}>
                        Cancel
                    </button>
                )}
            </div>
        );
    }

    if (status === "open") {
        return (
            <div className="ec-empty">
                <Orbit />
                <h2>{hasChats ? "Select a chat" : "No Conversations Yet"}</h2>
                <p>
                    Your WhatsApp <b>+{wa.me?.mobile}</b>
                    {wa.me?.name ? ` (${wa.me.name})` : ""} is linked. Chats appear here as they sync.
                </p>
                <button type="button" className="ec-btn-primary" onClick={onStartChat}>
                    Start a chat
                </button>
                <button type="button" className="ec-btn-ghost danger" onClick={onLogout} disabled={busy}>
                    <LogOut size={14} /> Unlink my WhatsApp
                </button>
            </div>
        );
    }

    // not_linked / logged_out
    return (
        <div className="ec-empty">
            <Orbit />
            <h2>No Conversations Yet</h2>
            <p>Start connecting with your customers through chat</p>
            {wa?.status !== "not_linked" && wa?.status !== "logged_out" && wa?.message && (
                <p className="ec-error-detail">{wa.message}</p>
            )}
            <button type="button" className="ec-btn-primary" onClick={onConnect} disabled={busy}>
                <Smartphone size={14} /> Connect my WhatsApp
            </button>
            <button type="button" className="ec-btn-ghost" onClick={onStartChat}>
                Start a chat
            </button>
        </div>
    );
}

// Ask AI: questions about quotations and chats, answered by whatsapp_ai.php.
const AI_SUGGESTIONS = [
    "Who hasn't replied to a quotation this week?",
    "Which customers replied? What did they say?",
    "Biggest quotations still waiting for a reply",
    "Followed up but still no reply, more than 3 days",
];

function AskAiPanel({ turns, busy, onAsk, onSaveCollection, onBack }) {
    const [question, setQuestion] = useState("");
    const endRef = useRef(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "end" });
    }, [turns.length, busy]);

    const submit = (text) => {
        const q = String(text ?? question).trim();
        if (!q || busy) return;
        setQuestion("");
        onAsk(q);
    };

    return (
        <div className="ec-ai">
            <header className="ec-table-header">
                <h2>
                    <button type="button" className="ec-icon-btn" onClick={onBack} title="Back to chats">
                        <ArrowLeft size={18} />
                    </button>
                    <Bot size={20} /> Ask AI
                </h2>
            </header>

            <div className="ec-ai-scroll">
                {turns.length === 0 && (
                    <div className="ec-ai-intro">
                        <p>Ask about quotations sent on WhatsApp, replies and customer chats.</p>
                        <div className="ec-ai-suggestions">
                            {AI_SUGGESTIONS.map((text) => (
                                <button key={text} type="button" className="ec-chip" onClick={() => submit(text)}>
                                    {text}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {turns.map((turn, index) => (
                    <div key={index} className={`ec-bubble-wrap ${turn.role === "user" ? "out" : "in"}`}>
                        <div className={`ec-bubble ${turn.error ? "ec-ai-error" : ""}`}>
                            <div className="ec-bubble-text">{turn.text}</div>
                            {(turn.collections || []).map((c, i) => (
                                <div key={i} className="ec-ai-collection">
                                    <div>
                                        <strong>
                                            <Folder size={14} /> {c.name}
                                        </strong>
                                        <small>
                                            {c.mobiles.length} customer{c.mobiles.length === 1 ? "" : "s"}
                                            {c.reason ? ` · ${c.reason}` : ""}
                                        </small>
                                    </div>
                                    <button
                                        type="button"
                                        className="ec-btn-small"
                                        disabled={c.saved || c.mobiles.length === 0}
                                        onClick={() => onSaveCollection(index, i)}
                                    >
                                        {c.saved ? "Saved" : "Save as collection"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
                {busy && (
                    <div className="ec-bubble-wrap in">
                        <div className="ec-bubble ec-ai-thinking">
                            <RefreshCw size={14} className="ec-spin" /> Looking through quotations and chats…
                        </div>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            <form
                className="ec-composer"
                onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                }}
            >
                <textarea
                    rows={1}
                    value={question}
                    placeholder="Ask about quotations, replies or a customer…"
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                />
                <button type="submit" title="Ask" disabled={busy || !question.trim()}>
                    <Send size={18} />
                </button>
            </form>
        </div>
    );
}

// ---------- page ----------

export default function EverestConnect() {
    const navigate = useNavigate();

    const [user, setUser] = useState(null);
    const [wa, setWa] = useState(null);
    const [busy, setBusy] = useState(false);

    const [chats, setChats] = useState([]);
    const [chatsLoading, setChatsLoading] = useState(false);
    const [chatsError, setChatsError] = useState("");
    const [accountsList, setAccountsList] = useState([]);
    const [viewAccount, setViewAccount] = useState(""); // admin: "" (mine) | "all" | uid

    const [view, setView] = useState("chats"); // chats | ai | collection:<id>
    const [aiTurns, setAiTurns] = useState([]); // {role, text, collections?, error?}
    const [aiBusy, setAiBusy] = useState(false);
    const [search, setSearch] = useState("");
    const [showSearch, setShowSearch] = useState(false);
    const [selected, setSelected] = useState(null); // chat object
    const [messages, setMessages] = useState([]);
    const [draft, setDraft] = useState("");
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState("");

    const [collectionsOpen, setCollectionsOpen] = useState(true);
    const [collections, setCollections] = useState(() => loadJson(COLLECTIONS_KEY, []));
    const [newCollectionName, setNewCollectionName] = useState(null);
    const [showNewChat, setShowNewChat] = useState(false);
    const [newChatNumber, setNewChatNumber] = useState("");

    const searchRef = useRef(null);
    const threadEndRef = useRef(null);
    const lastMessageId = useRef(null);

    useEffect(() => onAuthStateChanged(auth, setUser), []);

    const isAdmin = Boolean(wa?.is_admin);

    // ----- WhatsApp connection status (polls faster while linking)
    const loadStatus = useCallback(async () => {
        try {
            setWa(await callApi("status"));
        } catch (err) {
            // service_offline comes from PHP when the Node service is down; anything
            // else (missing PHP file, login expired, database) is shown as is.
            setWa({ status: err.data?.status || "error", message: err.message });
        }
    }, []);

    useEffect(() => {
        if (!user) return undefined;
        loadStatus();
        const linking = ["qr", "connecting", "starting"].includes(wa?.status);
        const timer = setInterval(loadStatus, linking ? 3000 : 20000);
        return () => clearInterval(timer);
    }, [user, wa?.status, loadStatus]);

    // ----- chats
    const loadChats = useCallback(async () => {
        setChatsLoading(true);
        try {
            const result = await callApi("chats", { account_uid: viewAccount, limit: 1000 });
            setChats(result.data || []);
            setChatsError("");
        } catch (err) {
            setChatsError(err.message);
        } finally {
            setChatsLoading(false);
        }
    }, [viewAccount]);

    useEffect(() => {
        if (!user) return undefined;
        loadChats();
        const timer = setInterval(loadChats, 6000);
        return () => clearInterval(timer);
    }, [user, loadChats]);

    useEffect(() => {
        if (!user || !isAdmin) return;
        callApi("accounts")
            .then((r) => setAccountsList(r.data || []))
            .catch(() => {});
    }, [user, isAdmin, wa?.status]);

    // ----- messages of the open chat
    const loadMessages = useCallback(async () => {
        if (!selected?.jid) return;
        try {
            const result = await callApi("messages", {
                jid: selected.jid,
                account_uid: selected.account_uid || ""
            });
            setMessages(result.data || []);
        } catch (err) {
            console.error("Messages error:", err);
        }
    }, [selected?.jid, selected?.account_uid]);

    useEffect(() => {
        setMessages([]);
        lastMessageId.current = null;
        if (!selected?.jid) return undefined;
        loadMessages();
        const timer = setInterval(loadMessages, 4000);
        return () => clearInterval(timer);
    }, [selected?.jid, selected?.account_uid, loadMessages]);

    useEffect(() => {
        const last = messages[messages.length - 1]?.id || null;
        if (last !== lastMessageId.current) {
            lastMessageId.current = last;
            threadEndRef.current?.scrollIntoView({ block: "end" });
        }
    }, [messages]);

    // Ctrl+K search
    useEffect(() => {
        const onKey = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setView((v) => (v === "ai" ? "chats" : v));
                setShowSearch(true);
                setTimeout(() => searchRef.current?.focus(), 0);
            }
            if (event.key === "Escape") {
                setShowNewChat(false);
                setNewCollectionName(null);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // ----- actions
    const connect = async () => {
        setBusy(true);
        try {
            setWa((prev) => ({ ...prev, ...{ status: "connecting" } }));
            await callApi("connect");
            await loadStatus();
        } catch (err) {
            window.alert(err.message);
        } finally {
            setBusy(false);
        }
    };

    const logout = async () => {
        if (wa?.status === "open" && !window.confirm("Unlink your WhatsApp from Everest Connect?")) return;
        setBusy(true);
        try {
            await callApi("logout");
            await loadStatus();
        } catch (err) {
            window.alert(err.message);
        } finally {
            setBusy(false);
        }
    };

    const openChat = (chat) => {
        setSelected(chat);
        setDraft("");
        setSendError("");
        if (chat.unread > 0 && (!chat.account_uid || chat.account_uid === user?.uid)) {
            setChats((prev) => prev.map((c) => (chatKey(c) === chatKey(chat) ? { ...c, unread: 0 } : c)));
            callApi("mark_read", { jid: chat.jid }).catch(() => {});
        }
    };

    // Find a chat for a number (prefer my own account), or a new empty one.
    const chatForMobile = (mobile, name = "") => {
        const key = last10(mobile);
        const mine = chats.filter((c) => last10(c.mobile) === key);
        const found = mine.find((c) => c.account_uid === user?.uid) || mine[0];
        if (found) return found;
        let number = digitsOnly(mobile);
        if (number.length === 10) number = `91${number}`;
        return { jid: `${number}@s.whatsapp.net`, mobile: number, name, account_uid: user?.uid, unread: 0, isNew: true };
    };

    const canSendFrom = (chat) => wa?.status === "open" && (!chat?.account_uid || chat.account_uid === user?.uid);

    const sendDraft = async () => {
        const text = draft.trim();
        if (!selected || !text || sending) return;
        if (!canSendFrom(selected)) return;
        setSending(true);
        setSendError("");
        try {
            const result = await callApi("send", { mobile: selected.mobile, text });
            setDraft("");
            if (selected.isNew && result.jid) {
                setSelected((prev) => ({ ...prev, jid: result.jid, isNew: false }));
            }
            await loadMessages();
            loadChats();
        } catch (err) {
            setSendError(err.message);
        } finally {
            setSending(false);
        }
    };

    const startNewChat = (event) => {
        event.preventDefault();
        const number = digitsOnly(newChatNumber);
        if (number.length < 10) return;
        setShowNewChat(false);
        setNewChatNumber("");
        setView("chats");
        openChat(chatForMobile(number));
    };

    const createCollection = (event) => {
        event.preventDefault();
        const name = String(newCollectionName || "").trim();
        if (!name) return;
        const item = { id: `${Date.now()}`, name, mobiles: [] };
        const next = [...collections, item];
        setCollections(next);
        saveJson(COLLECTIONS_KEY, next);
        setNewCollectionName(null);
        setView(`collection:${item.id}`);
    };

    const askAi = async (question) => {
        const history = aiTurns.filter((t) => !t.error).map((t) => ({ role: t.role, text: t.text }));
        setAiTurns((prev) => [...prev, { role: "user", text: question }]);
        setAiBusy(true);
        try {
            const response = await apiFetch("/serverphp/whatsapp_ai.php", {
                method: "POST",
                headers: { "Content-Type": "application/json", ...(await authHeaders()) },
                body: JSON.stringify({ question, history })
            });
            let data = {};
            try {
                data = await response.json();
            } catch {
                // not JSON
            }
            if (!data.success) throw new Error(data.message || `Ask AI failed (${response.status})`);
            setAiTurns((prev) => [
                ...prev,
                { role: "assistant", text: data.answer, collections: data.collections || [] }
            ]);
        } catch (err) {
            setAiTurns((prev) => [...prev, { role: "assistant", text: err.message, error: true }]);
        } finally {
            setAiBusy(false);
        }
    };

    const saveAiCollection = (turnIndex, collectionIndex) => {
        const proposal = aiTurns[turnIndex]?.collections?.[collectionIndex];
        if (!proposal) return;
        const mobiles = [...new Set(proposal.mobiles.map(last10).filter((m) => m.length === 10))];
        const item = { id: `${Date.now()}`, name: proposal.name, mobiles };
        const next = [...collections, item];
        setCollections(next);
        saveJson(COLLECTIONS_KEY, next);
        setCollectionsOpen(true);
        setAiTurns((prev) =>
            prev.map((t, i) =>
                i !== turnIndex
                    ? t
                    : { ...t, collections: t.collections.map((c, j) => (j === collectionIndex ? { ...c, saved: true } : c)) }
            )
        );
    };

    const toggleInCollection = (collectionId, mobile) => {
        const key = last10(mobile);
        const next = collections.map((c) => {
            if (c.id !== collectionId) return c;
            const has = c.mobiles.includes(key);
            return { ...c, mobiles: has ? c.mobiles.filter((m) => m !== key) : [...c.mobiles, key] };
        });
        setCollections(next);
        saveJson(COLLECTIONS_KEY, next);
    };

    const deleteCollection = (collectionId) => {
        if (!window.confirm("Delete this collection? Chats are not deleted.")) return;
        const next = collections.filter((c) => c.id !== collectionId);
        setCollections(next);
        saveJson(COLLECTIONS_KEY, next);
        if (view === `collection:${collectionId}`) setView("chats");
    };

    // ----- derived
    const unreadChats = chats.filter((c) => c.unread > 0).length;
    const activeCollection = view.startsWith("collection:")
        ? collections.find((c) => c.id === view.slice(11))
        : null;

    const visibleChats = useMemo(() => {
        let list = chats;
        if (activeCollection) list = list.filter((c) => activeCollection.mobiles.includes(last10(c.mobile)));
        const query = search.trim().toLowerCase();
        const queryDigits = digitsOnly(query);
        if (query) {
            list = list.filter((c) => {
                const text = [c.name, c.mobile, c.last_message, c.account_user].join(" ").toLowerCase();
                return text.includes(query) || (queryDigits.length >= 3 && String(c.mobile).includes(queryDigits));
            });
        }
        return list;
    }, [chats, activeCollection, search]);

    const listTitle = activeCollection ? activeCollection.name : "Chats";
    const badge = (count) => (count > 99 ? "99+" : String(count));
    const userName = wa?.user_name || user?.displayName || user?.email?.split("@")[0] || "User";

    const threadGroups = [];
    messages.forEach((m) => {
        const label = formatDay(m.ts);
        const group = threadGroups[threadGroups.length - 1];
        if (!group || group.label !== label) threadGroups.push({ label, items: [m] });
        else group.items.push(m);
    });

    const showAi = view === "ai";
    const wideMode = showAi;

    return (
        <div className="ec-page">
        <Banner />
        <div className={`ec-root ${selected && !wideMode ? "has-selection" : ""} ${wideMode ? "table-mode" : ""}`}>
            {/* ---------- left navigation ---------- */}
            <aside className="ec-nav">
                <div className="ec-nav-top">
                    <div className="ec-brand">Everest Connect</div>

                    <button
                        type="button"
                        className={`ec-nav-item ${showAi ? "active" : ""}`}
                        onClick={() => setView("ai")}
                    >
                        <Bot size={18} />
                        <span>Ask AI</span>
                    </button>

                    <button
                        type="button"
                        className={`ec-nav-item ${view === "chats" ? "active" : ""}`}
                        onClick={() => setView("chats")}
                    >
                        <MessagesSquare size={18} />
                        <span>Chats</span>
                        {unreadChats > 0 && <em className="ec-nav-badge">{badge(unreadChats)}</em>}
                    </button>

                    <div className="ec-nav-divider" />

                    <button
                        type="button"
                        className="ec-nav-item"
                        onClick={() => {
                            if (showAi) setView("chats");
                            setShowSearch(true);
                            setTimeout(() => searchRef.current?.focus(), 0);
                        }}
                    >
                        <Search size={18} />
                        <span>Search</span>
                        <kbd>Ctrl+K</kbd>
                    </button>

                    <button type="button" className="ec-nav-item" onClick={() => setCollectionsOpen((o) => !o)}>
                        <Folder size={18} />
                        <span>Collections</span>
                        {collectionsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>

                    {collectionsOpen && (
                        <div className="ec-collections">
                            {collections.map((c) => (
                                <div key={c.id} className="ec-collection-row">
                                    <button
                                        type="button"
                                        className={`ec-nav-item sub ${view === `collection:${c.id}` ? "active" : ""}`}
                                        onClick={() => setView(`collection:${c.id}`)}
                                    >
                                        {view === `collection:${c.id}` ? <FolderOpen size={17} /> : <Folder size={17} />}
                                        <span>{c.name}</span>
                                        {c.mobiles.length > 0 && <em className="ec-nav-badge muted">{c.mobiles.length}</em>}
                                    </button>
                                    <button
                                        type="button"
                                        className="ec-collection-delete"
                                        title="Delete collection"
                                        onClick={() => deleteCollection(c.id)}
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                            ))}

                            {newCollectionName !== null ? (
                                <form className="ec-new-collection" onSubmit={createCollection}>
                                    <input
                                        autoFocus
                                        value={newCollectionName}
                                        placeholder="Collection name"
                                        onChange={(e) => setNewCollectionName(e.target.value)}
                                        onBlur={() => !newCollectionName.trim() && setNewCollectionName(null)}
                                    />
                                </form>
                            ) : (
                                <button type="button" className="ec-nav-item sub" onClick={() => setNewCollectionName("")}>
                                    <Plus size={18} />
                                    <span>New Collection</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="ec-nav-bottom">
                    <button
                        type="button"
                        className={`ec-wa-pill ${wa?.status === "open" ? "on" : ""}`}
                        onClick={() => {
                            setView("chats");
                            setSelected(null);
                        }}
                        title="My WhatsApp connection"
                    >
                        <span className="dot" />
                        <span>{wa?.status === "open" ? `+${wa.me?.mobile}` : "WhatsApp not linked"}</span>
                    </button>
                    <button type="button" className="ec-user" onClick={() => navigate("/myprofile")}>
                        <span className="ec-user-avatar">{initialsOf(userName)}</span>
                        <span className="ec-user-text">
                            <strong>{userName}</strong>
                            <small>Everest Agencies</small>
                        </span>
                    </button>
                </div>
            </aside>

            {showAi ? (
                <div className="ec-main wide">
                    <AskAiPanel
                        turns={aiTurns}
                        busy={aiBusy}
                        onAsk={askAi}
                        onSaveCollection={saveAiCollection}
                        onBack={() => setView("chats")}
                    />
                </div>
            ) : (
                <>
                    {/* ---------- chat list ---------- */}
                    <div className="ec-list">
                        <header className="ec-list-header">
                            <button type="button" className="ec-icon-btn" onClick={() => navigate(-1)} title="Back">
                                <ArrowLeft size={18} />
                            </button>
                            <h3>{listTitle}</h3>
                            <div className="ec-list-actions">
                                <button type="button" className="ec-icon-btn" title="Refresh" onClick={loadChats}>
                                    <RefreshCw size={17} className={chatsLoading ? "ec-spin" : ""} />
                                </button>
                                <button type="button" className="ec-icon-btn" title="New chat" onClick={() => setShowNewChat(true)}>
                                    <UserPlus size={18} />
                                </button>
                                <button
                                    type="button"
                                    className="ec-icon-btn"
                                    title="Search (Ctrl+K)"
                                    onClick={() => {
                                        setShowSearch((s) => !s);
                                        setTimeout(() => searchRef.current?.focus(), 0);
                                    }}
                                >
                                    <Search size={18} />
                                </button>
                            </div>
                        </header>

                        {isAdmin && (
                            <select
                                className="ec-account-select"
                                value={viewAccount}
                                onChange={(e) => {
                                    setViewAccount(e.target.value);
                                    setSelected(null);
                                }}
                                title="Whose WhatsApp to show"
                            >
                                <option value="">My WhatsApp</option>
                                <option value="all">All users</option>
                                {accountsList
                                    .filter((a) => a.account_uid !== user?.uid)
                                    .map((a) => (
                                        <option key={a.account_uid} value={a.account_uid}>
                                            {a.user_name || a.user_email || a.account_uid}
                                            {a.wa_mobile ? ` (+${a.wa_mobile})` : ""}
                                            {a.status !== "open" ? " – not linked" : ""}
                                        </option>
                                    ))}
                            </select>
                        )}

                        {showSearch && (
                            <div className="ec-search">
                                <Search size={15} />
                                <input
                                    ref={searchRef}
                                    value={search}
                                    placeholder="Search name or number"
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                                {search && (
                                    <button type="button" onClick={() => setSearch("")} title="Clear">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="ec-list-scroll">
                            {chatsError && <div className="ec-list-note error">{chatsError}</div>}
                            {!chatsError && visibleChats.length === 0 && (
                                <div className="ec-list-note">
                                    {search
                                        ? "No chats match your search."
                                        : wa?.status === "open"
                                            ? "Waiting for chats to sync…"
                                            : "Link your WhatsApp to see your chats."}
                                </div>
                            )}

                            {visibleChats.map((chat) => (
                                <button
                                    type="button"
                                    key={chatKey(chat)}
                                    className={`ec-chat-row ${selected && chatKey(selected) === chatKey(chat) ? "selected" : ""}`}
                                    onClick={() => openChat(chat)}
                                >
                                    <Avatar name={chatName(chat)} seed={chat.mobile} />
                                    <div className="ec-chat-body">
                                        <div className="ec-chat-top">
                                            <strong>{chatName(chat)}</strong>
                                            <time>{formatListTime(chat.last_time)}</time>
                                        </div>
                                        <div className="ec-chat-bottom">
                                            <span className="ec-chat-preview">
                                                {chat.last_from_me ? <CheckCheck size={15} className="ec-ticks" /> : null}
                                                {chat.last_message || "New message"}
                                            </span>
                                            {chat.unread > 0 && <em className="ec-row-badge">{chat.unread}</em>}
                                        </div>
                                        {viewAccount === "all" && chat.account_user && (
                                            <div className="ec-chat-account">via {chat.account_user}</div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ---------- conversation / connect ---------- */}
                    <div className="ec-main">
                        {!selected ? (
                            <ConnectPanel
                                wa={wa}
                                busy={busy}
                                onConnect={connect}
                                onLogout={logout}
                                onStartChat={() => setShowNewChat(true)}
                                onRetry={loadStatus}
                                hasChats={chats.length > 0}
                            />
                        ) : (
                            <div className="ec-thread">
                                <header className="ec-thread-header">
                                    <button
                                        type="button"
                                        className="ec-icon-btn ec-mobile-only"
                                        onClick={() => setSelected(null)}
                                        title="Back to chats"
                                    >
                                        <ArrowLeft size={18} />
                                    </button>
                                    <Avatar name={chatName(selected)} seed={selected.mobile} size={40} />
                                    <div className="ec-thread-title">
                                        <strong>{chatName(selected)}</strong>
                                        <small>
                                            +{selected.mobile}
                                            {selected.account_uid && selected.account_uid !== user?.uid && selected.account_user
                                                ? ` · ${selected.account_user}'s WhatsApp`
                                                : ""}
                                        </small>
                                    </div>
                                    {collections.length > 0 && (
                                        <select
                                            className="ec-collection-select"
                                            value=""
                                            onChange={(e) => e.target.value && toggleInCollection(e.target.value, selected.mobile)}
                                            title="Add to / remove from collection"
                                        >
                                            <option value="">Collections…</option>
                                            {collections.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.mobiles.includes(last10(selected.mobile)) ? "✓ " : ""}
                                                    {c.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <button type="button" className="ec-icon-btn" onClick={() => setSelected(null)} title="Close">
                                        <X size={18} />
                                    </button>
                                </header>

                                <div className="ec-thread-scroll">
                                    {messages.length === 0 && <div className="ec-list-note">No messages yet. Say hello!</div>}
                                    {threadGroups.map((group) => (
                                        <div key={group.label}>
                                            <div className="ec-day">{group.label}</div>
                                            {group.items.map((m) => {
                                                const Icon = TYPE_ICON[m.msg_type];
                                                const mediaLabel =
                                                    m.msg_type === "document" ? m.file_name || "Document" : TYPE_LABEL[m.msg_type];
                                                return (
                                                    <div key={m.id} className={`ec-bubble-wrap ${m.from_me ? "out" : "in"}`}>
                                                        <div className="ec-bubble">
                                                            {mediaLabel && (
                                                                <div className="ec-attachment">
                                                                    {Icon ? <Icon size={16} /> : null}
                                                                    <span>{mediaLabel}</span>
                                                                </div>
                                                            )}
                                                            {m.body && <div className="ec-bubble-text">{m.body}</div>}
                                                            <div className="ec-bubble-foot">
                                                                {m.from_me && m.sent_by ? <span>{m.sent_by}</span> : null}
                                                                <time>{parseDate(m.ts)?.toTimeString().slice(0, 5)}</time>
                                                                {m.from_me ? <Check size={13} className="ec-ticks" /> : null}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                    <div ref={threadEndRef} />
                                </div>

                                {sendError && <div className="ec-send-error">{sendError}</div>}
                                {canSendFrom(selected) ? (
                                <form
                                    className="ec-composer"
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        sendDraft();
                                    }}
                                >
                                    <textarea
                                        rows={1}
                                        value={draft}
                                        placeholder={
                                            "Type a message"
                                        }
                                        onChange={(e) => setDraft(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                sendDraft();
                                            }
                                        }}
                                    />
                                    <button type="submit" title="Send" disabled={sending || !draft.trim()}>
                                        <Send size={18} />
                                    </button>
                                </form>
                                ) : selected.account_uid && user && selected.account_uid !== user.uid ? (
                                    <div className="ec-composer-locked">
                                        This chat is on {selected.account_user || "another user"}'s WhatsApp. Only they can reply
                                        from Everest Connect.
                                    </div>
                                ) : (
                                    <div className="ec-composer-locked">
                                        <span>
                                            {["qr", "connecting", "starting"].includes(wa?.status)
                                                ? "Finish linking your WhatsApp to chat from here."
                                                : "Link your WhatsApp to send and receive messages here, like WhatsApp Web."}
                                        </span>
                                        <button
                                            type="button"
                                            className="ec-btn-small"
                                            disabled={busy}
                                            onClick={() => {
                                                setSelected(null);
                                                if (!["qr", "connecting", "starting", "service_offline"].includes(wa?.status)) connect();
                                            }}
                                        >
                                            {["qr", "connecting", "starting"].includes(wa?.status) ? "Show QR code" : "Connect my WhatsApp"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* ---------- new chat dialog ---------- */}
            {showNewChat && (
                <div className="ec-modal-backdrop" onClick={() => setShowNewChat(false)}>
                    <form className="ec-modal" onClick={(e) => e.stopPropagation()} onSubmit={startNewChat}>
                        <div className="ec-modal-head">
                            <h4>Start a chat</h4>
                            <button type="button" onClick={() => setShowNewChat(false)} title="Close">
                                <X size={18} />
                            </button>
                        </div>
                        <label htmlFor="ec-new-number">WhatsApp number</label>
                        <input
                            id="ec-new-number"
                            autoFocus
                            inputMode="tel"
                            value={newChatNumber}
                            placeholder="e.g. 9876543210"
                            onChange={(e) => setNewChatNumber(e.target.value)}
                        />
                        <small>10-digit numbers get +91 added.</small>
                        <button type="submit" className="ec-btn-primary" disabled={digitsOnly(newChatNumber).length < 10}>
                            Start chat
                        </button>
                    </form>
                </div>
            )}

        </div>
        </div>
    );
}
