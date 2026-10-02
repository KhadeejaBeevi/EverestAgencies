// Example for a Node/Express backend. If your backend is Python (FastAPI/Flask) the idea is identical:
// firebase_admin.auth.verify_id_token(token) -> uid -> check role/permission.
// npm i firebase-admin
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.applicationDefault() });

async function verifyFirebaseToken(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ message: "Missing token" });
  try {
    req.user = await admin.auth().verifyIdToken(token); // throws if invalid/expired
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

// Enforce the same page permissions you check in the UI, but on the server.
function requirePage(pageName) {
  return async (req, res, next) => {
    const snap = await admin.firestore().doc(`PagePermissions/${req.user.uid}`).get();
    if (snap.exists && snap.data()[pageName] === true) return next();
    res.status(403).json({ message: "Forbidden" });
  };
}

module.exports = { verifyFirebaseToken, requirePage };

// usage:
// app.use("/api", verifyFirebaseToken);
// app.get("/api/quotations", requirePage("Quotation Wise"), handler);
