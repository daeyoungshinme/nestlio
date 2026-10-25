import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { PersistQueryClientProvider, removeOldestQuery } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import {
  DEFAULT_GC_TIME,
  PERSIST_CACHE_KEY,
  PERSIST_MAX_AGE,
  PERSIST_QUERY_KEYS,
  STALE_TIME,
} from "./constants/queryConfig";
import { installNumberInputWheelGuard } from "./utils/numberInputWheel";
import { createMutationCache } from "./utils/queryClient";

installNumberInputWheelGuard();

const queryClient = new QueryClient({
  mutationCache: createMutationCache(),
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME.SHORT,
      retry: 1,
      gcTime: DEFAULT_GC_TIME,
      refetchOnWindowFocus: (query) => Date.now() - (query.state.dataUpdatedAt ?? 0) > 60_000,
    },
  },
});

// 앱 재시작 시 대시보드/거래내역/예산/계좌 캐시를 즉시 표시하기 위한 persistence (24h TTL)
const persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: PERSIST_CACHE_KEY,
  throttleTime: 2000,
  retry: removeOldestQuery,
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster: "v3",
        maxAge: PERSIST_MAX_AGE,
        dehydrateOptions: {
          // 기본 판정(성공한 쿼리만)을 대체하지 않고 좁힌다 — 로딩 중·에러 상태가 저장되면 재방문 시 그대로 복원된다.
          shouldDehydrateQuery: (query) =>
            defaultShouldDehydrateQuery(query) && PERSIST_QUERY_KEYS.has(query.queryKey[0] as string),
        },
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </React.StrictMode>,
);
