import React, { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { toast } from "react-toastify";
import { Camera, Trash2, UserRound, X } from "lucide-react";
import Banner from "../Banner/Banner.jsx";
import { auth, db } from "../firebase";
import { resizeImage, MAX_UPLOAD_BYTES } from "./profilePhoto";

const lockedInputClass =
  "mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-100 text-gray-500";

// =========================================================
// PROFILE FORM
// Users edit their own photo and phone. Name, email and role
// are read-only here: reports match records by user name, so
// renaming is left to admins in Manage Users.
// =========================================================

function ProfileForm({ onSaved, onCancel }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [details, setDetails] = useState({});
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    const loadProfile = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "Users", user.uid));
        const data = snap.exists() ? snap.data() : {};

        setDetails({ ...data, email: data.email || user.email });
        setPhone(data.phone || "");
        setPhoto(data.photo || "");
      } catch (err) {
        console.error(err);
        toast.error("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Image must be smaller than 10 MB");
      return;
    }

    try {
      setPhoto(await resizeImage(file));
    } catch (err) {
      console.error(err);
      toast.error(err.message);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const trimmedPhone = phone.trim();
    if (trimmedPhone && !/^[+\d][\d\s-]{6,}$/.test(trimmedPhone)) {
      toast.error("Enter a valid phone number");
      return;
    }

    setSaving(true);

    try {
      const updates = { phone: trimmedPhone, photo };

      await setDoc(doc(db, "Users", auth.currentUser.uid), updates, {
        merge: true,
      });

      // Let the header refresh its avatar without a reload
      window.dispatchEvent(new Event("profile-updated"));

      toast.success("Profile updated successfully");
      onSaved?.(updates);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  const initials = `${(details.firstName || "").charAt(0)}${(
    details.lastName || ""
  ).charAt(0)}`.toUpperCase();

  return (
    <form onSubmit={handleSave} className="space-y-4 text-left">
      {/* PHOTO */}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative group w-28 h-28 rounded-full overflow-hidden border-4 border-red-100 bg-red-600 text-white flex items-center justify-center text-3xl font-bold"
          title="Change photo"
        >
          {photo ? (
            <img src={photo} alt="Profile" className="w-full h-full object-cover" />
          ) : initials ? (
            initials
          ) : (
            <UserRound size={48} />
          )}

          <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
            <Camera size={28} />
          </span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoSelect}
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100"
          >
            <Camera size={14} />
            {photo ? "Change photo" : "Add photo"}
          </button>

          {photo && (
            <button
              type="button"
              onClick={() => setPhoto("")}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-full border border-red-200 text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} />
              Remove
            </button>
          )}
        </div>
      </div>

      {/* EDITABLE */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Phone</label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 w-full px-3 py-2 border border-gray-400 rounded-md text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500"
          placeholder="Phone number"
        />
      </div>

      {/* READ-ONLY */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">First name</label>
          <input type="text" value={details.firstName || ""} disabled className={lockedInputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Last name</label>
          <input type="text" value={details.lastName || ""} disabled className={lockedInputClass} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Email address</label>
        <input type="email" value={details.email || ""} disabled className={lockedInputClass} />
      </div>

      {details.role && (
        <div>
          <label className="block text-sm font-medium text-gray-700">Role</label>
          <input type="text" value={details.role} disabled className={`${lockedInputClass} capitalize`} />
        </div>
      )}

      <p className="text-xs text-gray-500">
        To change your name or email, contact an administrator.
      </p>

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 font-bold rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
          >
            Cancel
          </button>
        )}

        <button
          type="submit"
          disabled={saving}
          className={`flex-1 py-2 font-bold rounded-full transition ${
            saving
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-red-600 hover:bg-red-700 text-white"
          }`}
        >
          {saving ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Saving...
            </div>
          ) : (
            "Save Changes"
          )}
        </button>
      </div>
    </form>
  );
}

// =========================================================
// EDIT PROFILE MODAL - opened from each dashboard
// =========================================================

export function EditProfileModal({ open, onClose, onSaved }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100000] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold mb-5 text-gray-800 text-center">
          Edit Profile
        </h2>

        <ProfileForm
          onCancel={onClose}
          onSaved={(updates) => {
            onSaved?.(updates);
            onClose();
          }}
        />
      </div>
    </div>
  );
}

// =========================================================
// MY PROFILE PAGE - /myprofile, linked from the header avatar
// =========================================================

function MyProfile() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecked(true);
    });

    return () => unsubscribe();
  }, []);

  if (authChecked && !user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <Banner />

      <div className="min-h-screen bg-gray-100 flex flex-col items-center px-4 pb-10">
        <div className="bg-white mt-10 p-6 rounded-lg shadow-md w-full max-w-md">
          <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">
            My Profile
          </h2>

          {user && <ProfileForm />}
        </div>
      </div>
    </div>
  );
}

export default MyProfile;
