// Everest WhatsApp service
//
// Every user links their own WhatsApp by QR code (WhatsApp "Linked devices").
// All accounts save into the same MySQL tables (wa_accounts / wa_chats /
// wa_messages, with account_uid = the user's Firebase uid), and messages are
// sent from the user's own number, for the Everest Connect page.
//
// It listens on 127.0.0.1 only. The browser never talks to it directly:
// serverphp/whatsapp_inbox.php calls it with the shared WA_SERVICE_KEY.
//
// Run:   cd whatsapp-service && npm install && npm start
// Keep it running with pm2 / NSSM / a Windows service (see README.md).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pino from "pino";
import QRCode from "qrcode";
import mysql from "mysql2/promise";
import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers,
    jidNormalizedUser,
    getContentType
} from "@whiskeysockets/baileys";

const here = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.WA_PORT || 3005);
const HOST = process.env.WA_HOST || "127.0.0.1";
const SERVICE_KEY = process.env.WA_SERVICE_KEY || "";
const AUTH_DIR = process.env.WA_AUTH_DIR || path.join(here, "auth");

const logger = pino({ level: process.env.LOG_LEVEL || "warn" });

const db = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "salescollection",
    charset: "utf8mb4",
    connectionLimit: 5
});

// ---------------------------------------------------------------- database

async function ensureTables() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS wa_accounts (
            account_uid VARCHAR(128) PRIMARY KEY,
            user_name VARCHAR(255) DEFAULT NULL,
            user_email VARCHAR(255) DEFAULT NULL,
            wa_mobile VARCHAR(30) DEFAULT NULL,
            wa_name VARCHAR(255) DEFAULT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'new',
            linked_at DATETIME DEFAULT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) DEFAULT CHARSET = utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS wa_chats (
            account_uid VARCHAR(128) NOT NULL,
            jid VARCHAR(100) NOT NULL,
            mobile VARCHAR(30) DEFAULT NULL,
            name VARCHAR(255) DEFAULT NULL,
            last_message TEXT,
            last_from_me TINYINT(1) NOT NULL DEFAULT 0,
            last_time DATETIME DEFAULT NULL,
            unread INT NOT NULL DEFAULT 0,
            PRIMARY KEY (account_uid, jid),
            INDEX idx_mobile (mobile),
            INDEX idx_last_time (last_time)
        ) DEFAULT CHARSET = utf8mb4
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS wa_messages (
            account_uid VARCHAR(128) NOT NULL,
            jid VARCHAR(100) NOT NULL,
            id VARCHAR(128) NOT NULL,
            mobile VARCHAR(30) DEFAULT NULL,
            from_me TINYINT(1) NOT NULL DEFAULT 0,
            body TEXT,
            msg_type VARCHAR(30) DEFAULT 'text',
            file_name VARCHAR(255) DEFAULT NULL,
            ts DATETIME NOT NULL,
            sent_by VARCHAR(255) DEFAULT NULL,
            PRIMARY KEY (account_uid, jid, id),
            INDEX idx_mobile_ts (mobile, ts),
            INDEX idx_ts (ts)
        ) DEFAULT CHARSET = utf8mb4
    `);
}

// ---------------------------------------------------------------- helpers

// Only one-to-one chats with phone numbers; groups, broadcasts and status
// updates are skipped.
function personalJid(jid) {
    if (!jid) return null;
    const normal = jidNormalizedUser(jid);
    return normal.endsWith("@s.whatsapp.net") ? normal : null;
}

const mobileOf = (jid) => String(jid || "").split("@")[0].replace(/\D/g, "") || null;

function unwrap(message) {
    let m = message;
    for (let i = 0; i < 5 && m; i++) {
        const inner =
            m.ephemeralMessage?.message ||
            m.viewOnceMessage?.message ||
            m.viewOnceMessageV2?.message ||
            m.documentWithCaptionMessage?.message ||
            m.editedMessage?.message;
        if (!inner) break;
        m = inner;
    }
    return m;
}

// Turns a WhatsApp message into { type, body, fileName } or null to skip it.
function describe(message) {
    const m = unwrap(message);
    if (!m) return null;
    const type = getContentType(m);
    switch (type) {
        case "conversation":
            return { type: "text", body: m.conversation };
        case "extendedTextMessage":
            return { type: "text", body: m.extendedTextMessage?.text || "" };
        case "imageMessage":
            return { type: "image", body: m.imageMessage?.caption || "" };
        case "videoMessage":
            return { type: "video", body: m.videoMessage?.caption || "" };
        case "audioMessage":
            return { type: "audio", body: "" };
        case "documentMessage":
            return {
                type: "document",
                body: m.documentMessage?.caption || "",
                fileName: m.documentMessage?.fileName || "Document"
            };
        case "stickerMessage":
            return { type: "sticker", body: "" };
        case "contactMessage":
            return { type: "contact", body: m.contactMessage?.displayName || "" };
        case "locationMessage":
            return { type: "location", body: m.locationMessage?.name || "" };
        default:
            // protocol / reaction / poll updates etc.
            return null;
    }
}

function previewText(info) {
    if (info.body) return info.body;
    return {
        image: "📷 Photo",
        video: "🎥 Video",
        audio: "🎤 Voice message",
        document: `📄 ${info.fileName || "Document"}`,
        sticker: "Sticker",
        contact: "Contact",
        location: "📍 Location"
    }[info.type] || "";
}

const toDate = (ts) => new Date(Number(ts || 0) * 1000 || Date.now());

// ---------------------------------------------------------------- one WhatsApp account per user

// Account ids are Firebase uids; keep them safe for use as folder names.
const safeAccount = (value) => {
    const id = String(value || "").trim();
    return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
};

class Account {
    constructor(uid) {
        this.uid = uid;
        this.authDir = path.join(AUTH_DIR, uid);
        this.status = "starting"; // starting | qr | connecting | open | logged_out | stopped
        this.qr = null;
        this.me = null;
        this.lastError = null;
        this.sock = null;
        this.timer = null;
        this.names = new Map();
        this.stopped = false;
    }

    async saveName(jid, name) {
        const chat = personalJid(jid);
        if (!chat || !name) return;
        this.names.set(chat, name);
        await db.query(
            `INSERT INTO wa_chats (account_uid, jid, mobile, name) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name)`,
            [this.uid, chat, mobileOf(chat), name]
        );
    }

    async saveMessage(msg, { live = false, sentBy = null } = {}) {
        const jid = personalJid(msg?.key?.remoteJid);
        if (!jid || !msg.message) return;
        const info = describe(msg.message);
        if (!info) return;

        const fromMe = msg.key.fromMe ? 1 : 0;
        const when = toDate(msg.messageTimestamp);
        const mobile = mobileOf(jid);
        const preview = previewText(info);

        const [result] = await db.query(
            `INSERT IGNORE INTO wa_messages
                (account_uid, jid, id, mobile, from_me, body, msg_type, file_name, ts, sent_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [this.uid, jid, msg.key.id, mobile, fromMe, info.body, info.type, info.fileName || null, when, sentBy]
        );
        if (!result.affectedRows) return; // already stored

        const name = (!fromMe && msg.pushName) || this.names.get(jid) || null;

        // Column order matters: last_time is updated last so the IF()s above
        // still compare against the previous value.
        await db.query(
            `INSERT INTO wa_chats (account_uid, jid, mobile, name, last_message, last_from_me, last_time, unread)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                name = COALESCE(name, VALUES(name)),
                last_message = IF(last_time IS NULL OR VALUES(last_time) >= last_time, VALUES(last_message), last_message),
                last_from_me = IF(last_time IS NULL OR VALUES(last_time) >= last_time, VALUES(last_from_me), last_from_me),
                unread = IF(VALUES(last_from_me) = 1 AND (last_time IS NULL OR VALUES(last_time) >= last_time), 0, unread + VALUES(unread)),
                last_time = GREATEST(COALESCE(last_time, VALUES(last_time)), VALUES(last_time))`,
            [this.uid, jid, mobile, name, preview, fromMe, when, live && !fromMe ? 1 : 0]
        );
    }

    async setAccountRow(fields) {
        const cols = Object.keys(fields);
        await db.query(
            `INSERT INTO wa_accounts (account_uid, ${cols.join(", ")}) VALUES (?, ${cols.map(() => "?").join(", ")})
             ON DUPLICATE KEY UPDATE ${cols.map((c) => `${c} = VALUES(${c})`).join(", ")}`,
            [this.uid, ...cols.map((c) => fields[c])]
        );
    }

    async start() {
        clearTimeout(this.timer);
        if (this.stopped) return;
        this.status = "connecting";

        const { state: authState, saveCreds } = await useMultiFileAuthState(this.authDir);
        let version;
        try {
            ({ version } = await fetchLatestBaileysVersion());
        } catch {
            version = undefined; // library default
        }

        const sock = makeWASocket({
            version,
            auth: authState,
            logger,
            // WhatsApp closes the connection (428 "Connection Terminated") before
            // sending a QR code for the Windows and macOS device types; the
            // Ubuntu type is accepted. The name shows in the phone's Linked devices.
            browser: Browsers.ubuntu("Everest Connect"),
            syncFullHistory: true,
            markOnlineOnConnect: false
        });
        this.sock = sock;

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            if (sock !== this.sock) return; // an older socket
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                this.status = "qr";
                this.qr = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
            }

            if (connection === "open") {
                this.status = "open";
                this.qr = null;
                this.lastError = null;
                this.me = {
                    mobile: mobileOf(sock.user?.id),
                    name: sock.user?.name || sock.user?.verifiedName || ""
                };
                console.log(`[${this.uid}] WhatsApp connected as +${this.me.mobile}`);
                await this.setAccountRow({
                    wa_mobile: this.me.mobile,
                    wa_name: this.me.name,
                    status: "open",
                    linked_at: new Date()
                }).catch((err) => console.error("Account save error:", err.message));
            }

            if (connection === "close") {
                const code = lastDisconnect?.error?.output?.statusCode;
                this.lastError = lastDisconnect?.error?.message || null;
                if (this.stopped) return;
                if (code === DisconnectReason.loggedOut) {
                    console.log(`[${this.uid}] logged out`);
                    this.status = "logged_out";
                    this.me = null;
                    this.qr = null;
                    fs.rmSync(this.authDir, { recursive: true, force: true });
                    await this.setAccountRow({ status: "logged_out" }).catch(() => {});
                    // No automatic restart: the user presses "Connect" again for a new QR.
                    accounts.delete(this.uid);
                } else {
                    this.status = "connecting";
                    this.timer = setTimeout(() => this.start().catch(logStartError(this)), 3000);
                }
            }
        });

        sock.ev.on("messaging-history.set", async ({ contacts = [], messages = [] }) => {
            try {
                for (const c of contacts) await this.saveName(c.id, c.name || c.notify || c.verifiedName);
                for (const m of messages) await this.saveMessage(m);
            } catch (err) {
                console.error(`[${this.uid}] history save error:`, err.message);
            }
        });

        sock.ev.on("contacts.upsert", async (contacts) => {
            for (const c of contacts) await this.saveName(c.id, c.name || c.notify || c.verifiedName).catch(() => {});
        });

        sock.ev.on("contacts.update", async (contacts) => {
            for (const c of contacts) {
                if (c.name || c.notify) await this.saveName(c.id, c.name || c.notify).catch(() => {});
            }
        });

        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            for (const m of messages) {
                await this.saveMessage(m, { live: type === "notify" }).catch((err) =>
                    console.error(`[${this.uid}] message save error:`, err.message)
                );
            }
        });
    }

    async logout() {
        this.stopped = true;
        clearTimeout(this.timer);
        if (this.sock && this.status === "open") {
            await this.sock.logout().catch(() => {});
        } else {
            this.sock?.end?.(undefined);
        }
        fs.rmSync(this.authDir, { recursive: true, force: true });
        this.status = "logged_out";
        await this.setAccountRow({ status: "logged_out" }).catch(() => {});
    }

    async send(body) {
        if (this.status !== "open" || !this.sock) {
            throw Object.assign(new Error("Your WhatsApp is not connected."), { code: 409 });
        }
        const mobile = normaliseMobile(body.mobile);
        if (!mobile) throw Object.assign(new Error("Valid mobile number is required."), { code: 400 });

        const [check] = await this.sock.onWhatsApp(mobile);
        if (!check?.exists) throw Object.assign(new Error("This number is not on WhatsApp."), { code: 404 });
        const jid = jidNormalizedUser(check.jid);

        let content;
        if (body.document_base64) {
            content = {
                document: Buffer.from(String(body.document_base64), "base64"),
                mimetype: body.mimetype || "application/pdf",
                fileName: body.file_name || "Quotation.pdf",
                caption: body.text || undefined
            };
        } else {
            const text = String(body.text || "").trim();
            if (!text) throw Object.assign(new Error("Message is empty."), { code: 400 });
            content = { text };
        }

        const sent = await this.sock.sendMessage(jid, content);
        await this.saveMessage(sent, { sentBy: body.sent_by || null });
        return { jid, id: sent.key.id };
    }

    toJSON() {
        return {
            account_uid: this.uid,
            status: this.status,
            qr: this.status === "qr" ? this.qr : null,
            me: this.me,
            error: this.lastError
        };
    }
}

const accounts = new Map();

const logStartError = (account) => (err) => {
    console.error(`[${account.uid}] could not start WhatsApp:`, err);
    account.lastError = err.message;
};

function getAccount(uid, { create = false } = {}) {
    let account = accounts.get(uid);
    if (!account && create) {
        account = new Account(uid);
        accounts.set(uid, account);
        account.start().catch(logStartError(account));
    }
    return account || null;
}

// ---------------------------------------------------------------- HTTP API

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size > 25 * 1024 * 1024) {
                reject(Object.assign(new Error("Body too large"), { code: 413 }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            try {
                resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
            } catch {
                reject(Object.assign(new Error("Invalid JSON"), { code: 400 }));
            }
        });
        req.on("error", reject);
    });
}

function reply(res, code, data) {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
}

function normaliseMobile(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 10) digits = `91${digits}`;
    return digits.length >= 11 ? digits : null;
}

// Every route takes ?account=<firebase uid>; PHP fills it from the verified login.
const server = http.createServer(async (req, res) => {
    try {
        if (SERVICE_KEY && req.headers["x-service-key"] !== SERVICE_KEY) {
            return reply(res, 401, { success: false, message: "Invalid service key." });
        }

        const url = new URL(req.url, "http://localhost");
        const route = `${req.method} ${url.pathname}`;

        if (route === "GET /accounts") {
            return reply(res, 200, { success: true, data: [...accounts.values()].map((a) => ({ ...a.toJSON(), qr: null })) });
        }

        const uid = safeAccount(url.searchParams.get("account"));
        if (!uid) return reply(res, 400, { success: false, message: "Account is required." });

        if (route === "GET /status") {
            const account = getAccount(uid);
            return reply(res, 200, {
                success: true,
                ...(account ? account.toJSON() : { account_uid: uid, status: "not_linked", qr: null, me: null })
            });
        }

        if (route === "POST /connect") {
            const body = await readBody(req);
            let account = getAccount(uid);
            if (account && ["logged_out", "stopped"].includes(account.status)) {
                accounts.delete(uid);
                account = null;
            }
            account = account || getAccount(uid, { create: true });
            await account.setAccountRow({
                user_name: body.user_name || null,
                user_email: body.user_email || null,
                status: "linking"
            });
            return reply(res, 200, { success: true, ...account.toJSON() });
        }

        if (route === "POST /send") {
            const account = getAccount(uid);
            if (!account) return reply(res, 409, { success: false, message: "Your WhatsApp is not connected." });
            const result = await account.send(await readBody(req));
            return reply(res, 200, { success: true, ...result });
        }

        if (route === "POST /logout") {
            const account = getAccount(uid);
            if (account) {
                await account.logout();
                accounts.delete(uid);
            } else {
                fs.rmSync(path.join(AUTH_DIR, uid), { recursive: true, force: true });
            }
            return reply(res, 200, { success: true });
        }

        return reply(res, 404, { success: false, message: "Not found." });
    } catch (err) {
        console.error(err);
        return reply(res, Number.isInteger(err.code) ? err.code : 500, {
            success: false,
            message: err.message || "Server error."
        });
    }
});

await ensureTables();

// Reconnect every account that was linked before the service restarted.
fs.mkdirSync(AUTH_DIR, { recursive: true });
for (const entry of fs.readdirSync(AUTH_DIR, { withFileTypes: true })) {
    const uid = entry.isDirectory() ? safeAccount(entry.name) : null;
    if (uid && fs.existsSync(path.join(AUTH_DIR, uid, "creds.json"))) {
        getAccount(uid, { create: true });
    }
}

server.listen(PORT, HOST, () => {
    console.log(`WhatsApp service listening on http://${HOST}:${PORT}`);
});
