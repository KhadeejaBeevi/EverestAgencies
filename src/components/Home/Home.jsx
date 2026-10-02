import React from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  Users,
  Briefcase,
  Zap,
} from "lucide-react";

const Home = () => {
const loginCards = [
  {
    title: "ENTER PORTAL",
    icon: <ShieldCheck size={38} />,
    path: "/login",
    desc: "Single Sign-On for Admin, KSEB, Sales and Users",
  },
];

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">

      {/* Background Video */}
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

      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />

      {/* Top Header */}
      <header className="relative z-10 w-full border-b border-white/10 bg-black/30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-[90px] flex items-center justify-between">

          {/* Logo */}
          <div className="flex items-center gap-4">
            <img
              src="/everestlogo.png"
              alt="Everest Logo"
              className="h-[60px] w-auto"
            />

            <div className="hidden md:block">
              <h1 className="text-2xl font-bold tracking-wide">
                Everest Agencies
              </h1>

              <p className="text-sm text-gray-300">
                Business Management Portal
              </p>
            </div>
          </div>

          {/* Right Side */}
          <div className="hidden md:flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />

            <span className="text-sm text-gray-300">
              Secure Access System
            </span>
          </div>

        </div>
      </header>

      {/* Hero Content */}
      <main className="relative z-10 min-h-[calc(100vh-90px)] flex flex-col items-center justify-center px-6">

        {/* Title */}
        <div className="text-center mb-14 max-w-3xl">

          <h2 className="text-4xl md:text-6xl font-extrabold leading-tight">
            Welcome to
            <span className="block text-red-500">
              Everest Digital Portal
            </span>
          </h2>

          

        </div>

        {/* Login Cards */}
        <div className="w-full flex justify-center items-center">
  {loginCards.map((card, index) => (
    <Link
      key={index}
      to={card.path}
      className="group w-full max-w-sm"
    >
      <div
        className="
          h-[240px]
          rounded-3xl
          border border-white/10
          bg-white/10
          backdrop-blur-xl
          shadow-2xl
          p-8
          flex flex-col
          justify-between
          transition-all
          duration-300
          hover:bg-red-600/90
          hover:scale-105
          hover:border-red-400
        "
      >
        <div
          className="
            w-16 h-16
            rounded-2xl
            bg-red-500/20
            flex items-center justify-center
            text-red-400
            group-hover:bg-white/20
            group-hover:text-white
            transition
          "
        >
          {card.icon}
        </div>

        <div>
          <h3 className="text-2xl font-bold tracking-wide">
            {card.title}
          </h3>

          <p className="mt-3 text-sm text-gray-300 group-hover:text-white">
            {card.desc}
          </p>
        </div>

        <div className="pt-4">
          <span
            className="
              inline-flex items-center
              text-sm font-semibold
              text-red-300
              group-hover:text-white
            "
          >
            Access Portal →
          </span>
        </div>
      </div>
    </Link>
  ))}
</div>

      </main>

    </div>
  );
};

export default Home;