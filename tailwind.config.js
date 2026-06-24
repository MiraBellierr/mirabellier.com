import typography from "@tailwindcss/typography";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        pink: {
          50: "#fdf2f8",
          100: "#fce7f3",
          200: "#fbcfe8",
          300: "#f9a8d4",
          400: "#f472b6",
          500: "#ec4899",
          600: "#db2777",
          700: "#be185d",
          800: "#9d174d",
          900: "#831843",
        },
      },
      keyframes: {
        wiggle: {
          "0%, 100%": { transform: "rotate(-3deg) translateZ(0)" },
          "50%": { transform: "rotate(3deg) translateZ(0)" },
        },
        "profile-hover": {
          "0%, 100%": {
            transform: "scale(1.01) rotate(-3deg) translateZ(0)",
          },
          "50%": {
            transform: "scale(1.01) rotate(3deg) translateZ(0)",
          },
        },
        "zoom-out": {
          "0%": { transform: "scale(1.2) translateZ(0)" },
          "100%": { transform: "scale(1) translateZ(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(-10px) translateZ(0)" },
          "100%": { opacity: "1", transform: "translateY(0) translateZ(0)" },
        },
      },
      animation: {
        wiggle: "wiggle 0.5s ease-in-out infinite",
        "profile-hover": "profile-hover 0.5s ease-in-out infinite",
        "zoom-out-once": "zoom-out 0.4s ease-out forwards",
        "fade-in": "fadeIn 0.3s ease-out",
      },
    },
  },
  plugins: [typography()],
  // Optimize by purging unused styles more aggressively
  safelist: ["bg-purple-500", "border-purple-500", "text-purple-500", "border-purple-300", "hover:bg-purple-50"],
};
