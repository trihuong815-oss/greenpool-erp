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
      // 2026-06-11: override font-mono — bỏ Consolas/Courier New (thiếu glyph
      // tiếng Việt trên Windows/Android → chữ vỡ). Chain ưu tiên modern mono
      // fonts có VN support; cuối là ui-monospace (system default).
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          '"SF Mono"',
          "Menlo",
          '"Cascadia Code"',
          '"JetBrains Mono"',
          '"Noto Sans Mono"',
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;