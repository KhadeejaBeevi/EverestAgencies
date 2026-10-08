import React, { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";
import { toast } from "react-toastify";
import { useNavigate, Link } from "react-router-dom";
import everestLogo from "/everestlogo.png";
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

function Userlogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

 // Emails a reset link. Accounts with a dummy email never receive it,
 // so those users are told to ask an admin, who can send the link to
 // their mobile from Manage Users.
 const handleForgotPassword = async () => {
  const trimmed = email.trim();

  if (!trimmed) {
    toast.info("Enter your email above, then tap Forgot Password");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, trimmed);
  } catch (err) {
    console.error(err);
    if (err?.code === "auth/invalid-email") {
      toast.error("Enter a valid email address");
      return;
    }
    if (err?.code === "auth/too-many-requests") {
      toast.error("Too many requests. Please try again later");
      return;
    }
    // Other errors (e.g. no such account) get the same message below,
    // so the screen doesn't reveal which emails are registered.
  }

  toast.success(
    "If this email is registered, a reset link has been sent. No email access? Ask your admin to send the link to your mobile.",
    { autoClose: 8000 }
  );
 };

 const handleSubmit = async (e) => {
  e.preventDefault();

  if (!email || !password) {
    toast.error("Please enter email and password");
    return;
  }

  setLoading(true);

  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    const user = userCredential.user;

    let role = null;

    // Check Users collection first
    const userSnap = await getDoc(
      doc(db, "Users", user.uid)
    );

    if (userSnap.exists()) {
      role = userSnap.data().role;
    }

    // Check Admin roles collection (for old admin accounts)
    if (!role) {
      const roleSnap = await getDoc(
        doc(db, "roles", user.uid)
      );

      if (roleSnap.exists()) {
        role = roleSnap.data().role;
      }
    }

    if (!role) {
      toast.error("Role not assigned");
      await auth.signOut();
      return;
    }

    switch (role) {
      case "admin":
        toast.success("Admin Login Successful");
        navigate("/admin-dashboard");
        break;

      case "KsebUser":
        toast.success("KSEB Login Successful");
        navigate("/ksebuserdashboard");
        break;

      case "sales":
        toast.success("Sales Login Successful");
        navigate("/salesdashboard");
        break;

      case "user":
        toast.success("Login Successful");
        navigate("/user-dashboard");
        break;

      default:
        toast.error("Access denied");
        await auth.signOut();
    }

  } catch (error) {
    console.log(error);

    let message = "Login failed";

    switch (error.code) {
      case "auth/invalid-credential":
        message = "Invalid email or password";
        break;

      case "auth/user-not-found":
        message = "User account not found";
        break;

      case "auth/wrong-password":
        message = "Incorrect password";
        break;

      case "auth/too-many-requests":
        message = "Too many attempts. Try again later";
        break;

      default:
        message = error.message;
    }

    toast.error(message);
  } finally {
    setLoading(false);
  }
};
  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      {/* VIDEO BACKGROUND */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="none"
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/intro.mp4" type="video/mp4" />
      </video>

      {/* DARK OVERLAY */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" />

      {/* TOP NAVBAR */}
      <header className="relative z-10 w-full border-b border-white/10 bg-black/30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <img
            src={everestLogo}
            alt="Everest Logo"
            className="h-12 md:h-14 object-contain"
          />

          <Link
            to="/"
            className="flex items-center gap-2 text-white/80 hover:text-white transition"
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Back to Home</span>
          </Link>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-80px)] px-4">
        <div className="w-full max-w-6xl grid lg:grid-cols-2 overflow-hidden rounded-3xl shadow-2xl border border-white/10 bg-white/10 backdrop-blur-xl">

          {/* LEFT SIDE */}
          <div className="hidden lg:flex flex-col justify-center p-14 text-white bg-gradient-to-br from-red-700/80 to-black/70">
            <div className="max-w-md">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 mb-6">
                <ShieldCheck size={18} />
                <span className="text-sm tracking-wide">
                  Everest Agencies Portal
                </span>
              </div>

              <h1 className="text-5xl font-bold leading-tight mb-6">
                Welcome Back
              </h1>

              <p className="text-white/80 text-lg leading-relaxed">
                Access your dashboard, manage operations, track activities,
                and stay connected with your workflow securely.
              </p>

              <div className="mt-10 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <p className="text-white/80">
                    Secure Firebase Authentication
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <p className="text-white/80">
                    Real-time Dashboard Access
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <p className="text-white/80">
                    Fast & Professional Workflow
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE LOGIN */}
          <div className="bg-white p-8 sm:p-12 flex items-center justify-center">
            <div className="w-full max-w-md">
              {/* MOBILE LOGO */}
              <div className="lg:hidden flex justify-center mb-6">
                <img
                  src={everestLogo}
                  alt="Everest Logo"
                  className="h-14 object-contain"
                />
              </div>

              <div className="mb-8 text-center lg:text-left">
                <h2 className="text-4xl font-bold text-gray-900">
                  Portal Login
                </h2>

                <p className="text-gray-500 mt-2">
                  Sign in to continue to your dashboard
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* EMAIL */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">
                    Email Address
                  </label>

                  <div className="relative">
                    <Mail
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    />

                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                      className="w-full h-14 pl-12 pr-4 rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-100 outline-none transition"
                    />
                  </div>
                </div>

                {/* PASSWORD */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">
                    Password
                  </label>

                  <div className="relative">
                    <Lock
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                    />

                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                      className="w-full h-14 pl-12 pr-12 rounded-xl border border-gray-300 bg-gray-50 focus:bg-white focus:border-red-500 focus:ring-4 focus:ring-red-100 outline-none transition"
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-600 transition"
                    >
                      {showPassword ? (
                        <EyeOff size={20} />
                      ) : (
                        <Eye size={20} />
                      )}
                    </button>
                  </div>
                </div>

                {/* REMEMBER + FORGOT */}
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-gray-600">
                    <input type="checkbox" className="accent-red-600" />
                    Remember me
                  </label>

                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-red-600 hover:text-red-700 font-medium"
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* LOGIN BUTTON */}
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full h-14 rounded-xl text-white font-semibold text-lg transition-all duration-300 shadow-lg ${loading
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-gradient-to-r from-red-600 to-red-700 hover:scale-[1.02] hover:shadow-red-500/30"
                    }`}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Signing In...
                    </div>
                  ) : (
                    "Login"
                  )}
                </button>
              </form>

              {/* FOOTER */}
              <div className="mt-8 text-center text-sm text-gray-500">
                © 2026 Everest Agencies. All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Userlogin;