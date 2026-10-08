import React, { useEffect } from "react";
import { X, Download } from "lucide-react";

// =========================================================
// PHOTO VIEWER
// Full-size preview of a profile photo. Used on My Profile,
// the user dashboards and the admin Manage Users page.
// Closes on backdrop click, the X button or the Escape key.
// =========================================================

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 200000,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    position: "relative",
    background: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    textAlign: "center",
    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
  },
  close: {
    position: "absolute",
    top: 10,
    right: 10,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "#555",
    padding: 4,
  },
  img: {
    width: "100%",
    maxHeight: "70vh",
    objectFit: "contain",
    borderRadius: 12,
    background: "#f3f4f6",
    marginTop: 8,
  },
  name: {
    margin: "14px 0 2px",
    fontSize: 18,
    fontWeight: 700,
    color: "#1f2937",
  },
  sub: { margin: 0, fontSize: 13, color: "#6b7280" },
  download: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    padding: "8px 16px",
    borderRadius: 999,
    background: "#dc2626",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
  },
};

export default function PhotoViewer({ open, photo, name, subtitle, onClose }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !photo) return null;

  const fileName = `${(name || "profile").trim().replace(/\s+/g, "_")}.jpg`;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          style={styles.close}
          aria-label="Close"
        >
          <X size={22} />
        </button>

        <img src={photo} alt={name || "Profile photo"} style={styles.img} />

        {name && <p style={styles.name}>{name}</p>}
        {subtitle && <p style={styles.sub}>{subtitle}</p>}

        <a href={photo} download={fileName} style={styles.download}>
          <Download size={16} />
          Download
        </a>
      </div>
    </div>
  );
}
