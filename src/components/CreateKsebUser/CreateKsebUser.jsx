import Banner from "../Banner/Banner.jsx";
import React, { useRef, useState } from 'react';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { setDoc, doc } from "firebase/firestore";
import { toast } from "react-toastify";
import "./CreateKsebUser.css";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { Camera, Trash2, UserRound } from "lucide-react";
import { resizeImage, MAX_UPLOAD_BYTES } from "../MyProfile/profilePhoto";
function CreateKsebUser() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState("");
  const fileInputRef = useRef(null);
  const [designation, setDesignation] = useState("");
  const [distribution, setDistribution] = useState("");

  const handleLogout = async () => {
    try {
      await auth.signOut();
      window.location.href = "/";
    } catch (error) {
      console.error(error.message);
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

    setLoading(true); // ✅ start loading

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      const user = auth.currentUser;

      if (user) {
        await setDoc(doc(db, "Users", user.uid), {
          email: user.email,
          firstName: fname,
          lastName: lname,
          phone: trimmedPhone,
          photo,
          role: "KsebUser",
          designation: designation,
          distribution: distribution,
        });
      }

      toast.success("KsebUser Created Successfully!", {
        position: "top-center",
      });

      // optional reset
      setEmail("");
      setPassword("");
      setFname("");
      setLname("");
      setPhone("");
      setPhoto("");

    } catch (error) {
      toast.error(error.message, {
        position: "bottom-center",
      });
    }

    setLoading(false); // ✅ stop loading
  };

  return (
    <div>
      <Banner />

     <div className="min-h-screen bg-gradient-to-br from-[#eef4fa] to-[#f8f7f4] flex flex-col items-center">

        {/* Header */}


        {/* Form */}
        <div className="bg-[#f8f7f4] mt-10 p-8 rounded-3xl shadow-2xl border border-[#ece8df] w-11/12 max-w-md">
          <h2 className="text-3xl font-extrabold mb-6 text-center text-[#0f4c81] tracking-wide">
            Create KSEB User
          </h2>

          <form onSubmit={handleRegister} className="space-y-4">
            <div className="flex flex-col items-center gap-3 mb-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative group w-24 h-24 rounded-full overflow-hidden border-4 border-[#dbe7f3] bg-[#0f4c81] text-white flex items-center justify-center"
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

            <input
              type="text"
              placeholder="First Name"
              className="w-full border border-[#d6d3d1] bg-white p-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0f4c81] transition"
              onChange={(e) => setFname(e.target.value)}
              required
            />

            <input
              type="text"
              placeholder="Last Name"
              className="w-full border border-[#d6d3d1] bg-white p-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0f4c81] transition"
              onChange={(e) => setLname(e.target.value)}
            />
            <select
              className="w-full border border-[#d6d3d1] bg-white p-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0f4c81] transition"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              required
            >
              <option value="">Select Designation</option>
              <option value="SalesCoordinator">Sales Coordinator</option>
              <option value="SalesExecutive">Sales Executive</option>
            </select>
            <select
              className="w-full border border-[#d6d3d1] bg-white p-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0f4c81] transition"
              value={distribution}
              onChange={(e) => setDistribution(e.target.value)}
              required
            >
              <option value="">Select Distribution</option>
              <option value="Distribution South">Distribution South</option>
              <option value="Distribution Central">Distribution Central</option>
              <option value="Distribution North">Distribution North</option>
            </select>
            <input
              type="email"
              placeholder="Email"
              className="w-full border border-[#d6d3d1] bg-white p-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0f4c81] transition"
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <input
              type="tel"
              placeholder="Phone Number"
              className="w-full border border-[#d6d3d1] bg-white p-3 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0f4c81] transition"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                className="w-full border border-[#d6d3d1] bg-white p-3 pr-10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#0f4c81] transition"
                value={password}
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
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-2xl font-semibold text-lg transition-all duration-300 ${
  loading
    ? "bg-gray-400 text-white"
    : "bg-gradient-to-r from-[#0f4c81] to-[#2563eb] text-white hover:scale-[1.02] hover:shadow-xl"
}`}
            >
              {loading ? "Creating..." : "Create KsebUser"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default CreateKsebUser;