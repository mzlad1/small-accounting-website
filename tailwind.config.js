/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "bg-primary": "#F5F1EA",
        "bg-surface": "#FFFEFB",
        "bg-sidebar": "#EFEAE0",
        "bg-sidebar-hover": "#E6DFD2",
        accent: {
          DEFAULT: "#BC5727",
          hover: "#A84B20",
          deep: "#8F3E1B",
          soft: "#F6E7DC",
        },
        "text-primary": "#221C15",
        "text-secondary": "#6F6459",
        "text-on-dark": "#F6F1E8",
        line: "#E7DFD2",
        success: { DEFAULT: "#4A7C59", soft: "#EAF1EB" },
        warning: { DEFAULT: "#A9741F", soft: "#F8F0DE" },
        danger: { DEFAULT: "#B23B2E", soft: "#F9E9E6" },
      },
      fontFamily: {
        sans: ["IBM Plex Sans Arabic", "Tajawal", "Segoe UI", "Tahoma", "sans-serif"],
        display: ["Alexandria", "IBM Plex Sans Arabic", "sans-serif"],
      },
      borderRadius: {
        btn: "10px",
        card: "16px",
      },
    },
  },
  plugins: [],
};
