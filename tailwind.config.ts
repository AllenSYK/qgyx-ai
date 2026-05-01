import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "#EEF7FF",
          card: "rgba(255,255,255,0.72)",
          cardBlue: "#DDEEFF",
          primary: "#1D4ED8",
          primaryDark: "#123C9C",
          text: "#102A43",
          muted: "#6B7C93",
          border: "rgba(29,78,216,0.12)"
        },
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1e40af"
        }
      },
      boxShadow: {
        card: "0 18px 50px rgba(29, 78, 216, 0.09)",
        glass: "0 24px 70px rgba(29, 78, 216, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
