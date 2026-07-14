/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        card: "0 1px 2px rgb(15 23 42 / 0.04), 0 4px 12px rgb(15 23 42 / 0.05)",
        "card-hover": "0 4px 8px rgb(15 23 42 / 0.06), 0 16px 32px rgb(15 23 42 / 0.10)",
      },
    },
  },
  plugins: [],
};
