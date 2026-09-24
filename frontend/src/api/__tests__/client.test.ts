import { AxiosError } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_EVENTS } from "@/constants/events";

const refreshSession = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: "old-token" } } })),
      onAuthStateChange: vi.fn(),
      refreshSession: (...args: unknown[]) => refreshSession(...args),
    },
  },
}));
const toast = vi.fn();
vi.mock("@/utils/toast", () => ({ toast: (...args: unknown[]) => toast(...args) }));

const { api } = await import("@/api/client");

type Responder = (config: InternalAxiosRequestConfig) => { status: number; data?: unknown };

/** 실제 네트워크 없이 인터셉터 체인만 돌리기 위한 어댑터 — 상태코드가 2xx가 아니면 axios의
 * settle처럼 response를 실은 AxiosError로 reject한다. */
function useAdapter(respond: Responder) {
  api.defaults.adapter = async (config) => {
    const { status, data } = respond(config);
    const response = { status, statusText: "", headers: {}, config, data } as AxiosResponse;
    if (status >= 200 && status < 300) return response;
    throw new AxiosError(`status ${status}`, undefined, config, undefined, response);
  };
}

const authHeader = (config: InternalAxiosRequestConfig) => String(config.headers.Authorization ?? "");

describe("api client interceptors", () => {
  let sessionExpired: ReturnType<typeof vi.fn<(event: Event) => void>>;

  beforeEach(() => {
    sessionExpired = vi.fn<(event: Event) => void>();
    window.addEventListener(APP_EVENTS.sessionExpired, sessionExpired);
    window.history.pushState({}, "", "/dashboard");
  });

  afterEach(() => {
    window.removeEventListener(APP_EVENTS.sessionExpired, sessionExpired);
    refreshSession.mockReset();
    toast.mockReset();
  });

  it("refreshes the session once for concurrent 401s and replays every queued request", async () => {
    let resolveRefresh!: (v: unknown) => void;
    refreshSession.mockReturnValue(new Promise((r) => (resolveRefresh = r)));
    useAdapter((config) =>
      authHeader(config) === "Bearer new-token" ? { status: 200, data: { url: config.url } } : { status: 401 },
    );

    const first = api.get("/a");
    const second = api.get("/b");
    await vi.waitFor(() => expect(refreshSession).toHaveBeenCalledTimes(1));
    resolveRefresh({ data: { session: { access_token: "new-token" } } });

    const [a, b] = await Promise.all([first, second]);
    expect([a.data.url, b.data.url]).toEqual(["/a", "/b"]);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  it("logs out when the refresh yields no session", async () => {
    refreshSession.mockResolvedValue({ data: { session: null } });
    useAdapter(() => ({ status: 401 }));

    await expect(api.get("/a")).rejects.toBeInstanceOf(AxiosError);
    expect(sessionExpired).toHaveBeenCalledTimes(1);
  });

  it("logs out immediately on the removed-spouse 403 without trying to refresh", async () => {
    useAdapter(() => ({ status: 403, data: { detail: "가구에서 제외된 계정입니다. 다시 로그인해 주세요." } }));

    await expect(api.get("/a")).rejects.toBeInstanceOf(AxiosError);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(sessionExpired).toHaveBeenCalledTimes(1);
  });

  it("does not log out on other 403s, and leaves 5xx toasts to the caller", async () => {
    useAdapter((config) => (config.url === "/forbidden" ? { status: 403, data: { detail: "권한 없음" } } : { status: 500 }));

    await expect(api.get("/forbidden")).rejects.toBeInstanceOf(AxiosError);
    await expect(api.post("/boom")).rejects.toBeInstanceOf(AxiosError);
    expect(sessionExpired).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
