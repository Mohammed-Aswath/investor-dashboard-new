import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#F4F3F0",
        ink: "#14130F",
        mist: "#4A4742",
        line: "rgba(20,19,15,0.10)",
        soft: "#ECEAE7",
        violet: {
          DEFAULT: "#6B5CF0",
          soft: "#EDEAFD",
          glow: "rgba(107,92,240,0.18)",
        },
        ice: "#9FD6EF",
        good: "#2A9D6B",
        warn: "#E8A430",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 2px 16px rgba(0,0,0,0.08)",
        lift: "0 8px 28px rgba(20,19,15,0.08)",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        ring: {
          "0%": { strokeDashoffset: "100" },
          "100%": { strokeDashoffset: "var(--ring-offset)" },
        },
      },
      animation: {
        rise: "rise 0.55s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
