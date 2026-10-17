# WhatsApp Cloud API (Meta) integration

Quotation Wise → **Send Selected WhatsApp** now has two modes:

| Mode | How it works | Seen / replied tracking |
|---|---|---|
| **WhatsApp App (manual)** | Opens each chat in WhatsApp Desktop/App; the user attaches the PDF and presses Send (the old flow). | No. WhatsApp tells us nothing. |
| **WhatsApp API (automatic)** | The server sends every selected customer an approved Meta template, with the quotation PDF attached, from the business number you pick. | Yes. Delivered, seen and replied times, the reply text, and whether Meta charged for the message. |

Everything sent shows in **WhatsApp Send Log**, with a status filter (Seen / Not seen / Replied / Not replied / Failed) and Excel export.

## Files

| File | Purpose |
|---|---|
| `serverphp/whatsapp_config.example.php` | Copy to `whatsapp_config.php` and fill in. The real file is git-ignored. |
| `serverphp/whatsapp_cloud.php` | Graph API helpers: send templates and text, upload PDFs, list numbers. Also adds the new database columns. |
| `serverphp/whatsapp_api.php` | Called by the app: numbers, templates, send, conversation. |
| `serverphp/whatsapp_webhook.php` | Called by **Meta**: sent / delivered / read / failed statuses, billing info, and customer replies. |
| `src/components/SalesOrder/QuotationWise/WhatsappApiSender.jsx` | The "WhatsApp API (automatic)" screen. |

Database: a new `whatsapp_messages` table (every API message in and out) and new columns on `whatsapp_send_log`. Both are created automatically on first use.

## One-time setup in Meta

You already finished *Step 3. Business verification*. Then:

1. **Add your numbers (Step 2. Production setup).** In WhatsApp Manager → Phone numbers, add all 5 numbers to the **same WhatsApp Business Account** and verify each one by SMS or call.
   A number that is still registered in the normal WhatsApp or WhatsApp Business app must be deleted from that app first, or moved with "coexistence".
   The app loads the numbers from Meta automatically, so a 6th number later needs no code change.
2. **Payment method.** In WhatsApp Manager → Settings → Payment methods, add a card. Without it only free messages go out.
3. **Permanent access token.**
   1. Go to Business Settings → Users → **System users** → Add (role Admin).
   2. Choose Assign assets → your App (full control) and your WhatsApp account (full control).
   3. Choose **Generate token**, select your app, and tick `whatsapp_business_messaging` and `whatsapp_business_management`. Set expiry to **Never**.
   4. Copy the token into `WA_ACCESS_TOKEN`.
   The temporary token from "Step 1. Try it out" expires after 24 hours. Don't use it.
4. **IDs.** Go to App dashboard → WhatsApp → API Setup:
   - "WhatsApp Business Account ID" goes in `WA_BUSINESS_ACCOUNT_ID`.
   - "Phone number ID" of the number you want selected by default goes in `WA_PHONE_NUMBER_ID`. This one is optional.
5. **App secret.** Copy App settings → Basic → App secret into `WA_APP_SECRET`.
6. **Webhook.** This is what records seen and replied.
   1. Put any random text in `WA_WEBHOOK_VERIFY_TOKEN`.
   2. Go to App dashboard → WhatsApp → **Configuration** → Webhook → Edit, and enter:
      - Callback URL: `https://app.everestagencies.com/serverphp/whatsapp_webhook.php` (must be public HTTPS)
      - Verify token: the same random text
   3. Choose **Verify and save**, then under Webhook fields **Subscribe** to `messages`.
   One webhook covers all 5 numbers.
7. **App mode.** Switch the app to **Live** (App dashboard top bar).
8. **Templates.** Go to WhatsApp Manager → Message templates → Create. Templates are shared by all numbers of the account. Example quotation template:
   - Category: **Utility**, name `quotation_ready`, language English
   - Header: **Document** (the app attaches the quotation PDF here)
   - Body: `Dear {{1}}, thank you for your enquiry. Please find attached our quotation {{2}} for Rs. {{3}} dated {{4}}. Reply to this message for any clarification. – Everest Agencies`
   - Optional quick-reply buttons, e.g. "Interested" and "Call me". Button taps come back as replies.

   In the app you choose which quotation field fills each `{{n}}`. The defaults are customer name, quotation no, amount, date and sales person. The choice is remembered per template.
   Use **Marketing** templates for offers and promotions; they cost more and need the customer's opt-in.
   Templates with image/video headers, header variables or dynamic URL buttons are listed but blocked from sending.

The server needs PHP `curl` and outbound HTTPS to `graph.facebook.com`. Files up to 10 MB can be uploaded.

## How seen / replied is recorded

- **Delivered** and **Seen** come from Meta's status webhook, each with its exact time. Statuses can arrive out of order; a late "delivered" never overwrites "seen".
- **Seen** is reported only if the customer has read receipts (blue ticks) turned on. Any **reply** also marks the message as seen.
- **Replied**: when the customer uses WhatsApp's *Reply* on our message, the reply is linked to that exact message. Otherwise it goes to the latest API message sent to that customer from the same business number in the last 30 days. The reply text and the number of replies are saved.
- **Failed** shows Meta's reason, for example "Recipient not on WhatsApp" or "Marketing message limit reached for this user".
- **Charged / Free** and the billed category (utility / marketing / service...) come from the `pricing` field of the same status webhook.

## Pricing (what Meta charges)

Meta charges **per delivered template message**, by template **category** and the **customer's country code**. A message that is never delivered isn't charged. You pay Meta directly by card; there is no monthly fee for the Cloud API itself.

| Category | Use for | India rate (approx., 2026) |
|---|---|---|
| **Marketing** | Offers, promotions, festival greetings, re-engagement | ~₹0.86 per message |
| **Utility** | Quotation ready, order and payment updates, follow-ups on an existing enquiry | ~₹0.115 per message |
| **Authentication** | OTP codes | ~₹0.115 per message |
| **Service** (free-text replies within 24 h of the customer's message) | Replying to customers | First 1,000 per business number per month free, then charged (from 1 Oct 2026) |

- Rates are before 18% GST. Cheaper volume tiers apply to Utility and Authentication only at very high monthly volumes.
- **Since 1 Oct 2026**, Utility templates are charged even inside the 24-hour window; they used to be free there.
- Conversations that start from a Click-to-WhatsApp ad or Facebook Page button are free for 72 hours.
- Meta decides the category when it approves a template. If a "Utility" template reads like a promotion, Meta reclassifies it as Marketing.
- Meta limits how many marketing messages one person receives from all businesses, so some marketing sends may fail with a limit error. Those aren't charged.
- There is a daily limit on how many different customers you can start conversations with by template. It is shared by the whole business portfolio and is low for new accounts. It rises automatically while message quality stays good. Check the current limit in WhatsApp Manager → Phone numbers (or the "quality" shown next to each number in the app).

Check the current official rate card before relying on these numbers: WhatsApp Manager → Insights shows actual spend, and Meta's pricing page lists rates by country (developers.facebook.com/docs/whatsapp/pricing). The figures above are from third-party summaries of Meta's 2026 rate card.
