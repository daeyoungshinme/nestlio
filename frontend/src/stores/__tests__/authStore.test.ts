import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  getSession: vi.fn(),
};
vi.mock("@/lib/supabase", () => ({ supabase: { auth } }));
const fetchMe = vi.fn();
vi.mock("@/api/users", () => ({ fetchMe: () => fetchMe() }));

const SB_TOKEN_KEY = "sb-placeholder-auth-token";
const USER = { id: "u-1", email: "a@example.com" };

/** 스토어는 import 시점에 localStorage로 낙관적 초기 상태를 정하므로 매번 새로 불러온다. */
async function loadStore() {
  vi.resetModules();
  const mod = await import("@/stores/authStore");
  return { useAuthStore: mod.useAuthStore, CACHE_KEY: mod.AUTH_ME_CACHE_KEY };
}

function cacheMe(cacheKey: string, userId: string, cachedAt = Date.now()) {
  localStorage.setItem(cacheKey, JSON.stringify({ userId, displayName: "캐시 이름", cachedAt }));
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("authStore 낙관적 초기 상태", () => {
  it("유효한 /me 캐시와 Supabase 세션 키가 있으면 확인 없이 로그인 상태로 시작한다", async () => {
    localStorage.setItem(SB_TOKEN_KEY, "{}");
    cacheMe("nestlio:auth-me", USER.id);

    const { useAuthStore } = await loadStore();

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      isAuthChecking: false,
      userId: USER.id,
      displayName: "캐시 이름",
    });
  });

  it.each([
    ["캐시가 만료됐으면", () => cacheMe("nestlio:auth-me", USER.id, Date.now() - 31 * 60 * 1000), true],
    ["Supabase 세션 키가 없으면", () => cacheMe("nestlio:auth-me", USER.id), false],
  ])("%s 확인 중 상태로 시작한다", async (_label, arrange, withSession) => {
    if (withSession) localStorage.setItem(SB_TOKEN_KEY, "{}");
    arrange();

    const { useAuthStore } = await loadStore();

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, isAuthChecking: true });
  });
});

describe("authStore.login", () => {
  it("성공하면 로그인 상태와 /me 캐시를 남긴다", async () => {
    const { useAuthStore, CACHE_KEY } = await loadStore();
    auth.signInWithPassword.mockResolvedValue({ data: { user: USER }, error: null });
    fetchMe.mockResolvedValue({ display_name: "대영" });

    await useAuthStore.getState().login(USER.email, "pw");

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      userId: USER.id,
      email: USER.email,
      displayName: "대영",
    });
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)).toMatchObject({ userId: USER.id, displayName: "대영" });
  });

  it("Supabase가 거부하면 그 메시지로 실패한다", async () => {
    const { useAuthStore } = await loadStore();
    auth.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "Invalid login credentials" } });

    await expect(useAuthStore.getState().login(USER.email, "bad")).rejects.toThrow("Invalid login credentials");
    expect(fetchMe).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it("로그인 뒤 /me 조회가 실패하면 로그인 상태로 만들지 않는다", async () => {
    const { useAuthStore, CACHE_KEY } = await loadStore();
    auth.signInWithPassword.mockResolvedValue({ data: { user: USER }, error: null });
    fetchMe.mockRejectedValue(new Error("down"));

    await expect(useAuthStore.getState().login(USER.email, "pw")).rejects.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });
});

describe("authStore.checkAuth", () => {
  it("세션이 없으면 로그아웃 상태로 확정한다", async () => {
    const { useAuthStore } = await loadStore();
    auth.getSession.mockResolvedValue({ data: { session: null } });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, isAuthChecking: false });
  });

  it("같은 사용자의 유효한 캐시가 있으면 /me를 다시 부르지 않는다", async () => {
    const { useAuthStore, CACHE_KEY } = await loadStore();
    cacheMe(CACHE_KEY, USER.id);
    auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });

    await useAuthStore.getState().checkAuth();

    expect(fetchMe).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, displayName: "캐시 이름" });
  });

  it("다른 사용자의 캐시면 /me로 새로 받아 캐시를 갈아 끼운다", async () => {
    const { useAuthStore, CACHE_KEY } = await loadStore();
    cacheMe(CACHE_KEY, "someone-else");
    auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });
    fetchMe.mockResolvedValue({ display_name: "새 이름" });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().displayName).toBe("새 이름");
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).userId).toBe(USER.id);
  });

  it.each([
    ["getSession이 던지면", () => auth.getSession.mockRejectedValue(new Error("x"))],
    [
      "/me가 실패하면",
      () => {
        auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });
        fetchMe.mockRejectedValue(new Error("403"));
      },
    ],
  ])("%s 로그아웃 상태로 확정한다", async (_label, arrange) => {
    const { useAuthStore } = await loadStore();
    arrange();

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, isAuthChecking: false });
  });
});

describe("authStore.logout", () => {
  it("상태·/me 캐시를 비우고 Supabase 세션을 끝낸다", async () => {
    localStorage.setItem(SB_TOKEN_KEY, "{}");
    cacheMe("nestlio:auth-me", USER.id);
    const { useAuthStore, CACHE_KEY } = await loadStore();

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, userId: null, displayName: null });
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    expect(auth.signOut).toHaveBeenCalled();
  });
});
