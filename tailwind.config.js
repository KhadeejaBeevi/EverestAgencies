/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // <- for React
  ],
  theme: {
    extend: {
      colors: {
        crimson: "#dc143c", // Optional custom crimson color
      },
    },
  },
  plugins: [],
}
