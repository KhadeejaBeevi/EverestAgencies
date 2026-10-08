import React, { useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { toast } from "react-toastify";
import { Eye, EyeOff, KeyRound, X } from "lucide-react";
import { auth } from "../firebase";

// =========================================================
// CHANGE PASSWORD
// The logged-in user confirms their current password, then
// sets a new one. Nothing is emailed, so this also works for
// accounts that were created with a dummy email address.
// =========================================================

const inputClass =
  "mt-1 w-full px-3 py-2 pr-10 border border-gray-400 rounded-md text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500";

function PasswordField({ label, value, onChange, show, onToggle, autoComplete }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 text-gray-500 hover:text-red-600"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

const friendlyError = (err) => {
  switch (err?.code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
      return "Current password is incorrect";
    case "auth/weak-password":
      return "New password is too weak (use at least 6 characters)";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again";
    case "auth/requires-recent-login":
      return "Please log out, log in again, then change your password";
    default:
      return err?.message || "Failed to change password";
  }
};

export default function ChangePasswordModal({ open, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setShow(false);
  };

  const close = () => {
    reset();
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!current || !next || !confirm) {
      toast.error("Please fill in all fields");
      return;
    }
    if (next.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords do not match");
      return;
    }
    if (next === current) {
      toast.error("New password must be different from the current one");
      return;
    }

    const user = auth.currentUser;
    if (!user?.email) {
      toast.error("You are not logged in");
      return;
    }

    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, next);

      toast.success("Password changed successfully");
      close();
    } catch (err) {
      console.error(err);
      toast.error(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[150000] bg-black/50 flex items-center justify-center p-4"
      onClick={close}
    >
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <h2 className="flex items-center justify-center gap-2 text-xl font-bold mb-5 text-gray-800">
          <KeyRound size={20} className="text-red-600" />
          Change Password
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <PasswordField
            label="Current password"
            value={current}
            onChange={setCurrent}
            show={show}
            onToggle={() => setShow((s) => !s)}
            autoComplete="current-password"
          />
          <PasswordField
            label="New password"
            value={next}
            onChange={setNext}
            show={show}
            onToggle={() => setShow((s) => !s)}
            autoComplete="new-password"
          />
          <PasswordField
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            show={show}
            onToggle={() => setShow((s) => !s)}
            autoComplete="new-password"
          />

          <p className="text-xs text-gray-500">
            Forgot your current password? Ask an administrator to send a reset
            link to your mobile number.
          </p>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={close}
              className="flex-1 py-2 font-bold rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 py-2 font-bold rounded-full transition ${
                saving
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }`}
            >
              {saving ? "Saving..." : "Update"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
