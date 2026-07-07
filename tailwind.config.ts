import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eef4ff", 100: "#dbe6fe", 200: "#bed0fd", 300: "#91b1fb",
          400: "#5d89f7", 500: "#3763f0", 600: "#2445e4", 700: "#1d35c9",
          800: "#1e2ea3", 900: "#1e2c81", 950: "#161b4d",
        },
        secondary: {
          50: "#f4f7f6", 100: "#e2e9e7", 500: "#3f6b63",
          600: "#33564f", 700: "#2b4640", 900: "#1a2b27",
        },
      },
    },
  },
  plugins: [],
};
export default config;
