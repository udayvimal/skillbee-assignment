import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          900: "#1e1b4b",
        },
        // Legacy aliases used by existing components
        surface: {
          DEFAULT: "#060612",
          card: "rgba(255,255,255,0.04)",
          border: "rgba(255,255,255,0.08)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "pulse-slow":   "pulse 3s ease-in-out infinite",
        "spin-slow":    "spin-slow 20s linear infinite",
        "float":        "float-up 6s ease-in-out infinite",
        "bar-wave":     "bar-wave 1.2s ease-in-out infinite",
        "pulse-ring":   "pulse-ring 2s ease-out infinite",
      },
      keyframes: {
        "float-up": {
          "0%,100%": { transform: "translateY(0px) scale(1)",    opacity: "0.6" },
          "50%":     { transform: "translateY(-30px) scale(1.05)", opacity: "0.9" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to:   { transform: "rotate(360deg)" },
        },
        "bar-wave": {
          "0%,100%": { transform: "scaleY(0.4)" },
          "50%":     { transform: "scaleY(1)" },
        },
        "pulse-ring": {
          "0%":   { transform: "scale(0.8)", opacity: "1" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
      },
      backdropBlur: { xl: "20px" },
    },
  },
  plugins: [],
};

export default config;
