import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes("node_modules")) {
            if (/[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) return "react-vendor";
            if (
              /[\\/]@tanstack[\\/](react-query|react-query-persist-client|query-sync-storage-persister)[\\/]/.test(
                id,
              )
            )
              return "query-vendor";
            if (id.includes("@supabase/supabase-js")) return "supabase-vendor";
            if (id.includes("lucide-react")) return "icons-vendor";
            if (/[\\/]axios(-retry)?[\\/]/.test(id)) return "http-vendor";
            // recharts는 일부러 여기서 하나의 청크로 묶지 않는다 — 전부 "chart-vendor" 하나로
            // 묶었더니(2026-09) Rolldown이 그 청크에서 대시보드 청크로 쓰이지 않는 cross-chunk
            // import를 하나 만들어내서, recharts를 전혀 쓰지 않는 대시보드(로그인 후 기본
            // 랜딩 라우트)가 매번 121KB gzip 청크를 불필요하게 받아오는 회귀가 있었다. 대신
            // 자동 분할에 맡기면 NetWorthTrendChart/AssetCompositionDonut/ReportsYearlyPage가
            // 실제로 공유하는 조각만 별도 청크로 나뉘고, 대시보드는 recharts를 전혀 받지 않는다
            // (scripts/check-bundle-size.mjs의 checkDashboardHasNoRecharts가 이 회귀를 가드).
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: Number(process.env.VITE_DEV_PORT) || 5273,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.VITE_BACKEND_PORT || 8899}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    env: {
      VITE_SUPABASE_URL: "https://placeholder.supabase.co",
      VITE_SUPABASE_ANON_KEY: "placeholder-anon-key-for-tests",
    },
    exclude: ["**/node_modules/**"],
  },
});
