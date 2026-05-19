import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#1F3A5F',
          gold: '#C9A227',
          teal: '#2E8B8B',
          green: '#7AC142',
          blue: '#1AB5C9',
        },
      },
    },
  },
  plugins: [],
};
export default config;
