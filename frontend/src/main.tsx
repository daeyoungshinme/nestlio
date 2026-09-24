import { MutationCache, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider, removeOldestQuery } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { DEFAULT_GC_TIME, PERSIST_CACHE_KEY, PERSIST_QUERY_KEYS, STALE_TIME } from "./constants/queryConfig";
import { installNumberInputWheelGuard } from "./utils/numberInputWheel";
import { extractErrorMessage } from "./utils/error";
import { toast } from "./utils/toast";

installNumberInputWheelGuard();

const queryClient = new QueryClient({
  // 자체 onError가 없는 뮤테이션만 여기서 알린다(있는 쪽은 각자 문구로 토스트하므로 중복 방지).
  // api/client.ts가 5xx를 전역 토스트하지 않기 때문에 이 폴백이 없으면 조용히 실패한다.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (!mutation.options.onError) toast(extractErrorMessage(error), "error");
    },
  }),
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
        buster: "v2",
        maxAge: 24 * 60 * 60 * 1000,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => PERSIST_QUERY_KEYS.has(query.queryKey[0] as string),
        },
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </React.StrictMode>,
);
