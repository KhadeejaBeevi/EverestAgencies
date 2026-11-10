# Everest Connect – WhatsApp service

Each user links **their own WhatsApp** to the Everest Connect page by scanning a
QR code (WhatsApp → Linked devices). All accounts are saved into the same MySQL
tables in the `salescollection` database:

| Table         | What it holds                                                    |
|---------------|------------------------------------------------------------------|
| `wa_accounts` | one row per user: Firebase uid, user name, WhatsApp number, status |
| `wa_chats`    | one row per user + customer chat (last message, unread count)    |
| `wa_messages` | every message, with `account_uid` = which user's WhatsApp        |

The tables are created automatically on first start.

```
Browser (Everest Connect page)
   │  /serverphp/whatsapp_inbox.php   (Firebase login checked here)
   ▼
PHP  ── reads chats/messages from MySQL
   │  QR / send / unlink → http://127.0.0.1:3005  (this service, local only)
   ▼
Node service ── one WhatsApp session per user ── saves messages to MySQL
```

## Quick start (Windows server where XAMPP runs)

1. Install **Node.js LTS** from https://nodejs.org (Next, Next, Finish).
2. Copy this `whatsapp-service` folder to the server, e.g. `C:\everest\whatsapp-service`.
3. Double-click **start-whatsapp-service.bat**. The first time it installs its packages
   (needs internet), then shows `WhatsApp service listening on http://127.0.0.1:3005`.
   Keep that window open.
4. Open **Everest Connect** on the website → **Connect my WhatsApp** → on your phone open
   WhatsApp → **Linked devices** → **Link a device** → scan the QR code. Same as WhatsApp Web.

That's all. The service listens only on the server itself (127.0.0.1), so it is not
reachable from outside.

### Optional: shared secret key

For extra safety, set the same secret on both sides:

- Before starting the service: `set WA_SERVICE_KEY=put-a-long-random-secret-here`
- In `C:\xampp\apache\conf\httpd.conf`: `SetEnv WA_SERVICE_KEY put-a-long-random-secret-here`, then restart Apache.

## Keep it running (recommended)

Use pm2 so it starts again after a crash or reboot:

```
npm install -g pm2 pm2-windows-startup
pm2 start index.js --name everest-whatsapp
pm2 save
pm2-startup install
```

(Set `WA_SERVICE_KEY` as a Windows system environment variable first so pm2 picks it up.)

## Settings (environment variables, all optional)

| Variable         | Default            |
|------------------|--------------------|
| `WA_SERVICE_KEY` | (none – set it!)   |
| `WA_PORT`        | `3005`             |
| `WA_HOST`        | `127.0.0.1`        |
| `WA_AUTH_DIR`    | `./auth` (one folder per user's WhatsApp login – keep it private, back it up) |
| `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `localhost` / `root` / (empty) / `salescollection` |

PHP side (`serverphp/whatsapp_inbox.php`): `WA_SERVICE_URL` (default
`http://127.0.0.1:3005`) and `WA_SERVICE_KEY`.

## Using it

1. Admin: Page Access → give users **Everest Connect**.
2. User opens **Everest Connect** → **Connect my WhatsApp** → scans the QR with their phone.
3. Chats sync in and new messages appear live. Messages typed on the page are sent from that user's own WhatsApp.
4. **Collections → Quotations sent** lists every quotation sent from Quotation Wise Followup with:
   - *Customer replied* – the customer sent a message after the quotation
   - *Followed up* – no customer message, but we messaged again (10+ minutes later)
   - *Sent, no reply yet* – nothing from the customer since
5. Quotation Wise Followup shows the same status under "WhatsApp sent", and has two
   new filters: **WhatsApp Reply Not Come** and **WhatsApp Customer Replied**.

A reply to **any** user's WhatsApp counts, so if a customer answers a different
staff member, the quotation still shows as replied.

Admins can switch the chat list to another user's WhatsApp or "All users".
Users only see and send from their own.

## Notes

- This uses WhatsApp Web linking (the Baileys library), which is not an official
  WhatsApp API. Normal one-to-one messages to customers are fine; avoid sending the
  same message to many numbers quickly, which can get a number blocked.
- The phone must go online at least once every ~14 days or WhatsApp unlinks the device.
- Only one-to-one chats are saved; groups and status updates are skipped.
