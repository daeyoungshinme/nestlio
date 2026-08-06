import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
            if (id.includes("recharts")) return "chart-vendor";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5273,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8899",
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
