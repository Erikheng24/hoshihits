import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#080808",
        panel: "#151515",
        "panel-2": "#1c1c1c",
        edge: "#262626",
        "edge-2": "#333333",
        gold: "#D4AF37",
        "gold-soft": "#e8cc6d",
        "gold-dim": "#8a7223",
        mist: "#9a9a9a",
        fog: "#6b6b6b",
        jade: "#4ade80",
        ruby: "#f87171",
        sky2: "#60a5fa",
        amberish: "#fbbf24",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 32px -16px rgba(0,0,0,0.8)",
        pop: "0 24px 64px -24px rgba(0,0,0,0.9), 0 0 0 1px rgba(212,175,55,0.12)",
        "gold-glow": "0 0 24px -6px rgba(212,175,55,0.35)",
      },
      borderRadius: {
        card: "14px",
      },
      keyframes: {
        rise: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadein: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        rise: "rise .45s cubic-bezier(.22,1,.36,1) both",
        fadein: "fadein .3s ease both",
      },
    },
  },
  plugins: [],
};
export default config;
