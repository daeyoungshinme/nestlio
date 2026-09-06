import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // 앱 전역 accent(emerald 계열). 인터랙티브 크롬(버튼·탭·네비·포커스 링·행 액션 hover 등)은
        // raw `emerald-*`/`blue-*`가 아니라 이 `primary` / `primary-600` … 토큰만 쓴다.
        // 상태/심각도 색(info=blue, warning=amber, critical=red 등)은 `utils/colors.ts`가 관리하는
        // 별개 체계이며, 거기의 blue는 "primary가 아닌 정보성"이라는 의미라 그대로 둔다.
        primary: {
          DEFAULT: "#059669",
          50: "#ECFDF5",
          100: "#D1FAE5",
          200: "#A7F3D0",
          300: "#6EE7B7",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
          800: "#065F46",
          900: "#064E3B",
          950: "#022C22",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
