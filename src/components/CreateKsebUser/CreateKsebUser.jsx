import Banner from "../Banner/Banner.jsx";
import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { setDoc, doc } from "firebase/firestore";
import { toast } from "react-toastify";
import "./CreateKsebUser.css";
import { FaEye, FaEyeSlash } from "react-icons/fa";
function CreateKsebUser() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true); // ✅ start loading

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      const user = auth.currentUser;

      if (user) {
        await setDoc(doc(db, "Users", user.uid), {
          email: user.email,
          firstName: fname,
          lastName: lname,
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