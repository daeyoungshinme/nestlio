import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 앱 전역 accent. growlio에서 옮겨온 화면 대부분이 emerald 계열을 쓰던 것을 하나의
        // 토큰으로 통일했다 — 새 UI는 raw `emerald-*`/`blue-*` 대신 `primary` / `primary-600` …을 쓴다.
        primary: {
          DEFAULT: "#059669",
          50: "#ECFDF5",
          100: "#D1FAE5",
          300: "#6EE7B7",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
          950: "#022C22",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
