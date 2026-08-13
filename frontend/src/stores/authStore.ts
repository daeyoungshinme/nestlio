import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { fetchMe } from "@/api/users";
import { extractErrorMessage } from "@/utils/error";

export const AUTH_ME_CACHE_KEY = "nestlio:auth-me";
const AUTH_ME_TTL = 30 * 60 * 1000;

interface AuthMeCache {
  userId: string;
  displayName: string;
  cachedAt: number;
}

export interface AuthState {
  isAuthenticated: boolean;
  isAuthChecking: boolean;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

interface OptimisticAuth {
  isAuthChecking: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  displayName: string | null;
}

function getOptimisticAuthState(): OptimisticAuth {
  const fallback: OptimisticAuth = {
    isAuthChecking: true,
    isAuthenticated: false,
    userId: null,
    displayName: null,
  };
  try {
    const raw = localStorage.getItem(AUTH_ME_CACHE_KEY);
    if (!raw) return fallback;
    const cached: AuthMeCache = JSON.parse(raw);
    if (Date.now() - cached.cachedAt >= AUTH_ME_TTL) return fallback;
    const hasSbSession = Object.keys(localStorage).some(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
    if (!hasSbSession) return fallback;
    return {
      isAuthChecking: false,
      isAuthenticated: true,
      userId: cached.userId,
      displayName: cached.displayName,
    };
  } catch {
    return fallback;
  }
}

export const useAuthStore = create<AuthState>((set) => {
  const setLoggedIn = (userId: string, email: string | null, displayName: string) =>
    set({ isAuthenticated: true, userId, email, displayName, isAuthChecking: false });
  const setLoggedOut = () =>
    set({ isAuthenticated: false, userId: null, email: null, displayName: null, isAuthChecking: false });

  const optimistic = getOptimisticAuthState();

  return {
    isAuthenticated: optimistic.isAuthenticated,
    isAuthChecking: optimistic.isAuthChecking,
    userId: optimistic.userId,
    email: null,
    displayName: optimistic.displayName,

    login: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.user) throw new Error(error?.message ?? "로그인에 실패했습니다.");

      // nestlio는 자체 회원가입이 없다 - 로컬 User 미러 행은 백엔드의 get_current_user가
      // 첫 인증된 API 요청에서 알아서 생성한다. /users/me 응답만 표시용으로 가져온다.
      let me;
      try {
        me = await fetchMe();
      } catch (fetchMeError) {
        if (import.meta.env.DEV) console.error("post-login fetchMe failed", fetchMeError);
        throw new Error(
          extractErrorMessage(fetchMeError, "로그인 후 사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."),
        );
      }
      setLoggedIn(data.user.id, data.user.email ?? null, me.display_name);
      localStorage.setItem(
        AUTH_ME_CACHE_KEY,
        JSON.stringify({ userId: data.user.id, displayName: me.display_name, cachedAt: Date.now() } satisfies AuthMeCache),
      );
    },

    logout: async () => {
      setLoggedOut();
      localStorage.removeItem(AUTH_ME_CACHE_KEY);
      await supabase.auth.signOut();
    },

    checkAuth: async () => {
      let session;
      try {
        const {
          data: { session: fetchedSession },
        } = await supabase.auth.getSession();
        session = fetchedSession;
      } catch {
        setLoggedOut();
        return;
      }
      if (!session?.user) {
        setLoggedOut();
        return;
      }

      try {
        const raw = localStorage.getItem(AUTH_ME_CACHE_KEY);
        if (raw) {
          const cached: AuthMeCache = JSON.parse(raw);
          if (cached.userId === session.user.id && Date.now() - cached.cachedAt < AUTH_ME_TTL) {
            setLoggedIn(session.user.id, session.user.email ?? null, cached.displayName);
            return;
          }
        }
      } catch {
        // 파싱 실패 시 무시하고 네트워크 요청으로 fallback
      }

      try {
        const me = await fetchMe();
        setLoggedIn(session.user.id, session.user.email ?? null, me.display_name);
        localStorage.setItem(
          AUTH_ME_CACHE_KEY,
          JSON.stringify({
            userId: session.user.id,
            displayName: me.display_name,
            cachedAt: Date.now(),
          } satisfies AuthMeCache),
        );
      } catch {
        setLoggedOut();
      }
    },
  };
});
