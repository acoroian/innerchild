/** @type {import('tailwindcss').Config} */
export default {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["Lora", "Georgia", "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // Warm, reflective palette — soft sand + dusk + sage.
        sand: {
          50: "#fbf8f3",
          100: "#f5efe4",
          200: "#ebe0c9",
          300: "#dccba2",
        },
        dusk: {
          400: "#9a8c8c",
          500: "#7e6e6e",
          600: "#5e4f4f",
          700: "#43383a",
          900: "#221b1d",
        },
        sage: {
          400: "#8aa68f",
          500: "#6e8c75",
        },
      },
    },
  },
  plugins: [],
};
