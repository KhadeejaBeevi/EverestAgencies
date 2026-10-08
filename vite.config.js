import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // `npm run dev` only: pages call "/serverphp/..." (the same address as the
  // live site), and the dev server forwards it to the local XAMPP copy at
  // http://localhost/everest/serverphp. Builds and the live site are unchanged.
  server: {
    proxy: {
      "/serverphp": {
        target: "http://localhost",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/serverphp/, "/everest/serverphp"),
      },
    },
  },
  // removes the ~250 console.log calls from production builds automatically
  esbuild: mode === "production" ? { drop: ["console", "debugger"] } : {},
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
        },
      },
    },
  },
}));
