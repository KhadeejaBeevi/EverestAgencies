import Banner from "../Banner/Banner.jsx";
import React, { useRef, useState } from 'react';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { setDoc, doc } from "firebase/firestore";
import { toast } from "react-toastify";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { Camera, Trash2, UserRound } from "lucide-react";
import { resizeImage, MAX_UPLOAD_BYTES } from "../MyProfile/profilePhoto";
import "./CreateSalesUser.css";
function CreateSalesUser() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState("");
  const fileInputRef = useRef(null);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      window.location.href = "/";
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
      await createUserWithEmailAndPassword(auth, email, password);
      const user = auth.currentUser;

      if (user) {
        await setDoc(doc(db, "Users", user.uid), {
          email: user.email,
          firstName: fname,
          lastName: lname,
          phone: trimmedPhone,
          photo,
          role: "sales", // 🔥 Fixed role
          createdAt: new Date()
        });
      }

      toast.success("Sales User Created Successfully!", {
        position: "top-center",
      });

      // Clear form
      setEmail("");
      setPassword("");
      setFname("");
      setLname("");
      setPhone("");
      setPhoto("");

      // ⚠️ Important: logout newly created user
      await auth.signOut();

    } catch (error) {
      console.log(error.message);
      toast.error(error.message, {
        position: "bottom-center",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Banner />
   <div className="page-container">



  <div className="form-card">
    <h2 className="form-title">Create Sales User</h2>

    <form onSubmit={handleRegister}>

      <div className="flex flex-col items-center gap-3 mb-4">
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

      <div className="input-group">
        <input className="input" placeholder="First Name" onChange={(e)=>setFname(e.target.value)} />
      </div>

      <div className="input-group">
        <input className="input" placeholder="Last Name" onChange={(e)=>setLname(e.target.value)} />
      </div>

      <div className="input-group">
        <input className="input" placeholder="Email" onChange={(e)=>setEmail(e.target.value)} />
      </div>

      <div className="input-group">
        <input type="tel" className="input" placeholder="Phone Number" value={phone} onChange={(e)=>setPhone(e.target.value)} />
      </div>

      <div className="input-group password-wrapper">
        <input
          type={showPassword ? "text" : "password"}
          className="input"
          placeholder="Password"
          onChange={(e)=>setPassword(e.target.value)}
        />

        <button type="button" className="eye-btn" onClick={()=>setShowPassword(!showPassword)}>
          {showPassword ? <FaEyeSlash/> : <FaEye/>}
        </button>
      </div>

      <button
        type="submit"
        disabled={loading}
        className={`submit-btn ${loading ? "disabled" : "active"}`}
      >
        {loading ? "Creating..." : "Create Sales User"}
      </button>

    </form>
  </div>
</div>
</div>
  );
}

export default CreateSalesUser;