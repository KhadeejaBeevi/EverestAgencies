# What was changed in this edited project

## Already applied in `src/`
- `api/apiClient.js`: sends Firebase ID token (Authorization: Bearer), 30s timeout, clearer errors. Same `apiFetch` signature.
- `AuthContext.jsx`: one auth listener; loads role + page permissions once; adds `hasAccess(page)`, `refreshProfile()`.
- `components/ProtectedRoute.jsx`: uses AuthContext (no extra listener/Firestore read per page). Logged-out users go to `/login`.
- `App.jsx`: fixed `tenderexecutive` -> `TenderExecutive` import (Linux case bug); 55 pages converted to `React.lazy` + `<Suspense>`.
- Removed: `components/SalesOrder.zip`, `pages/CRM.zip`, `pages/newpartydetails.zip`, `test.jsx`, `api/.env`.
- Added: `lib/queryClient.jsx` (NOT wired in yet, see below).

## Project-root files (put next to package.json, NOT inside src)
- `vite.config.js`: drops console.log in production, splits vendor chunks. Merge with yours if you have custom settings.
- `.gitignore`, `.env.example`.
- `backend-examples/`: token verification (Express) and Firestore rules. Not part of the frontend build.

## You must do
1. `src/api/.env` was removed from this copy. Keep your own copy at `.env` in the project ROOT (Vite reads it from there; `VITE_API_BASE_URL`, `VITE_API_KEY`).
   Rotate the API key, as it was exposed in the zip and is public in the browser bundle.
2. Backend must verify the Firebase token (see backend-examples), then remove VITE_API_KEY.
3. Publish Firestore rules (adjust the admin check first).
4. Optional: `npm i @tanstack/react-query`, then wrap `<App/>` in `QueryProvider` in main.jsx.
5. `npm run dev` and click through each module, then `npm run build`.

## Not changed (needs a separate pass)
Giant files (QuotationWise 4,900 lines, KSEBPayment, QuotationFollowup, TenderDetails...), the 6.8 MB stock .txt in public/, console.log cleanup in source (production build strips them).
`pages/CRM/EnquiryReport.jsx` and `components/SalesOrder/EnquiryReport/` are different components with the same name; both are used, so both are kept.
