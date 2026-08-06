import axios from "axios";
import axiosRetry from "axios-retry";
import type { InternalAxiosRequestConfig } from "axios";
import { supabase } from "@/lib/supabase";
import { toast } from "@/utils/toast";

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

type QueueEntry = { resolve: (token: string) => void; reject: (err: unknown) => void };

let isRefreshing = false;
let failedQueue: QueueEntry[] = [];
// 세션 토큰 캐시 — 매 요청마다 getSession() 호출을 피하기 위해 모듈 레벨에서 관리
let cachedToken: string | null = null;

void supabase.auth.getSession().then(({ data: { session } }) => {
  cachedToken = session?.access_token ?? null;
});
supabase.auth.onAuthStateChange((_event, session) => {
  cachedToken = session?.access_token ?? null;
});

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  failedQueue = [];
}

export const api = axios.create({
  // dev: Vite 프록시(/api -> 127.0.0.1:8899), prod: FastAPI가 SPA와 같은 오리진에서 서빙
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

// 응답 자체를 못 받은(네트워크 끊김/타임아웃) GET류 요청만 재시도한다 - 서버가 응답을 준
// 4xx/5xx는 재시도해도 무의미하거나(인증 만료 등) 위험하므로 대상에서 제외하고,
// POST/PUT/DELETE는 "요청이 서버에 도달했지만 응답만 유실"된 경우 재시도가 중복 실행을
// 유발할 수 있어 idempotent 메서드로만 제한한다.
axiosRetry(api, {
  retries: 2,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    !error.response &&
    ["get", "head", "options"].includes(error.config?.method ?? "") &&
    (error.code === "ECONNABORTED" || axiosRetry.isNetworkError(error)),
});

api.interceptors.request.use(async (config) => {
  // 로그인 직후 첫 요청 시점엔 onAuthStateChange 콜백이 아직 cachedToken을 채우기 전일 수 있다 -
  // 그 경우 getSession()으로 즉시 폴백한다 (supabase-js가 세션을 메모리에 캐시해두므로 네트워크 요청 없이 반환됨).
  const token = cachedToken ?? (await supabase.auth.getSession()).data.session?.access_token ?? null;
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const config = error.config as RetryableConfig | undefined;
    const status = error.response?.status as number | undefined;

    if (status === 401 && config && !config._retry) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          config.headers["Authorization"] = `Bearer ${token}`;
          return api.request(config);
        });
      }

      config._retry = true;
      isRefreshing = true;

      try {
        const {
          data: { session },
        } = await supabase.auth.refreshSession();
        if (session?.access_token) {
          cachedToken = session.access_token;
          config.headers["Authorization"] = `Bearer ${session.access_token}`;
          processQueue(null, session.access_token);
          return api.request(config);
        }
        processQueue(error);
      } catch (refreshError) {
        processQueue(refreshError);
      } finally {
        isRefreshing = false;
      }

      if (window.location.pathname !== "/login") {
        toast("세션이 만료되었습니다. 다시 로그인해 주세요.", "error");
        window.dispatchEvent(new CustomEvent("nestlio:session-expired"));
      }
    } else if (status != null && status >= 500) {
      toast("서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", "error");
    }

    return Promise.reject(error);
  },
);

type ApiConfig = Parameters<typeof api.get>[1];

export const apiGet = <T>(url: string, config?: ApiConfig) => api.get<T>(url, config).then((r) => r.data);

export const apiPost = <T>(url: string, data?: unknown, config?: ApiConfig) =>
  api.post<T>(url, data, config).then((r) => r.data);

export const apiPut = <T>(url: string, data?: unknown, config?: ApiConfig) =>
  api.put<T>(url, data, config).then((r) => r.data);

export const apiDelete = <T = unknown>(url: string, config?: ApiConfig) =>
  api.delete<T>(url, config).then((r) => r.data);
