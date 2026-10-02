import Banner from "../Banner/Banner.jsx";
import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../firebase";
import { setDoc, doc } from "firebase/firestore";
import { toast } from "react-toastify";
import { FaEye, FaEyeSlash } from "react-icons/fa";
function CreateUser() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [loading, setLoading] = useState(false); // Add loading state
  const [showPassword, setShowPassword] = useState(false);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      window.location.href = "/";
      console.log("Admin logged out successfully!");
    } catch (error) {
      console.error("Error logging out:", error.message);
    }
  };

const handleRegister = async (e) => {
  e.preventDefault();

  setLoading(true);

  try {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
console.log("Auth created:", userCredential.user.uid);

await setDoc(doc(db, "Users", userCredential.user.uid), {
  email: userCredential.user.email,
  firstName: fname,
  lastName: lname,
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
