<?php
/*
 * WhatsApp Cloud API (Meta) settings.
 *
 * Copy this file to whatsapp_config.php (same folder) and fill in the values.
 * whatsapp_config.php is in .gitignore, so the access token never goes to GitHub.
 * Each value can also come from a server environment variable of the same name.
 *
 * Where to find each value: see docs/WHATSAPP_CLOUD_API.md
 */

return [
    // Permanent token of a System User (Business Settings > Users > System users
    // > Generate token, with whatsapp_business_messaging and
    // whatsapp_business_management permissions).
    "WA_ACCESS_TOKEN" => "",

    // App dashboard > WhatsApp > API Setup > "WhatsApp Business Account ID".
    // All phone numbers of this account (e.g. your 5 numbers) are loaded from
    // Meta automatically and can be chosen as "Send from" in the app.
    // Numbers in different business accounts: list the ids separated by commas.
    "WA_BUSINESS_ACCOUNT_ID" => "",

    // Optional: the number selected by default. App dashboard > WhatsApp >
    // API Setup > "Phone number ID" (a long id, NOT the phone number itself).
    // Empty = the first number of the account.
    "WA_PHONE_NUMBER_ID" => "",

    // App dashboard > App settings > Basic > "App secret".
    // Used to check that webhook calls really come from Meta.
    "WA_APP_SECRET" => "",

    // Any random text you choose. Enter the same text as "Verify token"
    // when you add the webhook URL in the App dashboard.
    "WA_WEBHOOK_VERIFY_TOKEN" => "",

    // Graph API version.
    "WA_GRAPH_VERSION" => "v23.0",
];
