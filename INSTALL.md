# Everest Connect – install guide

This ZIP contains every new and changed file, at the same paths as in the
EverestAgencies project. The changed files were made from the src folder you
sent (your latest copy), so they keep all your newer pages and menu items.
Copy them over your project folder (overwrite when asked).

## Files

New:
- src/pages/EverestConnect/EverestConnect.jsx   – the page
- src/pages/EverestConnect/EverestConnect.css   – its styles
- serverphp/whatsapp_inbox.php                  – PHP API for the page
- serverphp/whatsapp_common.php                 – shared helpers (needed by both PHP files)
- serverphp/whatsapp_ai.php                     – Ask AI
- whatsapp-service/                             – Node service that links WhatsApp (see its README.md)

Changed:
- src/App.jsx                       – route /everest-connect (page access name "Everest Connect")
- src/components/Banner/Banner.jsx  – "Everest Connect" as its own top-level menu item (desktop + mobile)
- src/components/PageAccess/PageAccess.jsx – "Everest Connect" added to the page list
- src/components/SalesOrder/QuotationWise/QuotationWise.jsx – reply status + 2 new filters

Exact changes to your existing files (only these lines were added):
- App.jsx: 1 import line + the /everest-connect route (before /chatbot)
- Banner.jsx: `MessagesSquare` icon import + 1 top-level menu item between Quotation Tracking and CRM
- PageAccess.jsx: "Everest Connect" after "Job Application Response"
- QuotationWise.jsx: reply-status fetch, badge under "WhatsApp sent", 2 filter options

## Steps

1. Copy the files into the project.
2. Copy `serverphp/whatsapp_inbox.php` to the live `serverphp` folder.
3. On the server: install Node.js LTS, then double-click `whatsapp-service/start-whatsapp-service.bat` (details in `whatsapp-service/README.md`)
   Keep its window open, or set it up with pm2 to run always.
4. Build and deploy the website as usual: `npm run build`.
5. Page Access → tick **Everest Connect** for the users who should use it.
6. Each user opens Everest Connect → **Connect my WhatsApp** → scans the QR code.

Database tables (wa_accounts, wa_chats, wa_messages in `salescollection`) are
created automatically.

## Ask AI (optional)

1. In the serverphp folder on the server (needs PHP 8.1 or newer):
       composer require anthropic-ai/sdk guzzlehttp/guzzle
2. Get an API key at https://console.anthropic.com (Settings → API keys).
3. In C:\xampp\apache\conf\httpd.conf add:
       SetEnv ANTHROPIC_API_KEY sk-ant-...your key...
   then restart Apache.

Ask AI sends the quotation list and the chats it reads to Anthropic to answer.
Each question costs a small amount on your Anthropic account.
