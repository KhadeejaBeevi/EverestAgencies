import Banner from "../Banner/Banner.jsx";
import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { setDoc, doc } from "firebase/firestore";
import { toast } from "react-toastify";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import "./CreateSalesUser.css";
function CreateSalesUser() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      window.location.href = "/";
    } catch (error) {
      console.error("Error logging out:", error.message);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      const user = auth.currentUser;

      if (user) {
        await setDoc(doc(db, "Users", user.uid), {
          email: user.email,
          firstName: fname,
          lastName: lname,
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

      <div className="input-group">
        <input className="input" placeholder="First Name" onChange={(e)=>setFname(e.target.value)} />
      </div>

      <div className="input-group">
        <input className="input" placeholder="Last Name" onChange={(e)=>setLname(e.target.value)} />
      </div>

      <div className="input-group">
        <input className="input" placeholder="Email" onChange={(e)=>setEmail(e.target.value)} />
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