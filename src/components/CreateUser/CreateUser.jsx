import Banner from "../Banner/Banner.jsx";
import React, { useRef, useState } from 'react';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { setDoc, doc } from "firebase/firestore";
import { toast } from "react-toastify";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { Camera, Trash2, UserRound } from "lucide-react";
import { resizeImage, MAX_UPLOAD_BYTES } from "../MyProfile/profilePhoto";
function CreateUser() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [loading, setLoading] = useState(false); // Add loading state
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState("");
  const fileInputRef = useRef(null);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      window.location.href = "/";
      console.log("Admin logged out successfully!");
    } catch (error) {
      console.error("Error logging out:", error.message);
    }
  };

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

const handleRegister = async (e) => {
  e.preventDefault();

  const trimmedPhone = phone.trim();
  if (trimmedPhone && !/^[+\d][\d\s-]{6,}$/.test(trimmedPhone)) {
    toast.error("Enter a valid phone number");
    return;
  }

  setLoading(true);

  try {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
console.log("Auth created:", userCredential.user.uid);

await setDoc(doc(db, "Users", userCredential.user.uid), {
  email: userCredential.user.email,
  firstName: fname,
  lastName: lname,
  phone: trimmedPhone,
  photo,
  role: "user",
});

console.log("Firestore document created");

    toast.success("User Registered Successfully!");
  } catch (err) {
    console.error(err);
    toast.error(err.message);
  } finally {
    setLoading(false);
  }
};

  return (
    <div>
      <Banner />
      <div className="min-h-screen bg-gray-100 flex flex-col items-center">
        {/* Crimson banner with logo */}



        {/* Registration form */}
        <div className="bg-white mt-10 p-6 rounded-lg shadow-md w-11/12 max-w-sm text-center">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">Create User</h2>
          <form onSubmit={handleRegister} className="space-y-4 text-left">
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative group w-24 h-24 rounded-full overflow-hidden border-4 border-red-100 bg-red-600 text-white flex items-center justify-center"
                title={photo ? "Change photo" : "Add photo"}
              >
                {photo ? (
                  <img src={photo} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <UserRound size={44} />
                )}

                <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <Camera size={26} />
                </span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />

              <div className="flex flex-wrap justify-center gap-2">
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
            <div>
              <label className="block text-sm font-medium text-gray-700">First name</label>
              <input
                type="text"
                className="mt-1 w-full px-3 py-2 border border-gray-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="First name"
                onChange={(e) => setFname(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Last name</label>
              <input
                type="text"
                className="mt-1 w-full px-3 py-2 border border-gray-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Last name"
                onChange={(e) => setLname(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email address</label>
              <input
                type="email"
                className="mt-1 w-full px-3 py-2 border border-gray-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Enter email"
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Phone number</label>
              <input
                type="tel"
                className="mt-1 w-full px-3 py-2 border border-gray-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Enter phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>

              <div className="mt-1 relative">
                <input
                  type={showPassword ? "text" : "password"}
                  className="w-full px-3 py-2 pr-10 border border-gray-400 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Enter password"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600"
                >
                  {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading} // Disable button during loading
              className={`w-full py-2 font-bold rounded-full transition ${loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Signing in...
                </div>
              ) : (
                'Submit'
              )}
            </button>
          </form>
          <p className="text-sm mt-4 text-gray-600">
            Create New User?{" "}
            <a href="/Createuser" className="text-red-600 hover:underline">
              Create
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default CreateUser;
