import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        lavi: {
          50: "#F5F9FF",
          100: "#EAF3FF",
          500: "#2F80ED",
          600: "#1C5DB8",
          900: "#142235",
          950: "#0B1830",
        },
      },
    },
  },
  plugins: [],
};

export default config;