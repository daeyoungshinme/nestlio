import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let authListener: ((event: string) => void) | null = null;
const getSession = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: (cb: (event: string) => void) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
  },
}));
const checkAuth = vi.fn(async () => {});
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: { checkAuth: typeof checkAuth }) => unknown) => select({ checkAuth }),
}));
const acceptInvite = vi.fn();
vi.mock("@/api/invites", () => ({ acceptInvite: (...args: unknown[]) => acceptInvite(...args) }));

const { default: AuthCallbackPage } = await import("@/pages/AuthCallbackPage");

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/" element={<p>홈 화면</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authListener = null;
  getSession.mockResolvedValue({ data: { session: null } });
});
afterEach(() => vi.useRealTimers());

describe("AuthCallbackPage", () => {
  it("리다이렉트 URL의 에러 설명을 바로 보여주고 세션을 기다리지 않는다", () => {
    renderAt("/auth/callback?error=access_denied&error_description=링크가 만료되었습니다");

    expect(screen.getByText("링크가 만료되었습니다")).toBeInTheDocument();
    expect(getSession).not.toHaveBeenCalled();
  });

  it("이미 세션이 있으면 인증 상태를 갱신하고 홈으로 이동한다", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u-1" } } } });

    renderAt("/auth/callback");

    expect(await screen.findByText(/이메일 인증이 완료되었습니다/)).toBeInTheDocument();
    expect(checkAuth).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("홈 화면", {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("SIGNED_IN 이벤트와 세션 확인이 겹쳐도 한 번만 처리하고, 초대 토큰이 있으면 수락한다", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u-1" } } } });
    acceptInvite.mockResolvedValue({});

    renderAt("/auth/callback?invite_token=tok&display_name=지은");
    act(() => authListener?.("SIGNED_IN"));

    expect(await screen.findByText(/이메일 인증이 완료되었습니다/)).toBeInTheDocument();
    expect(checkAuth).toHaveBeenCalledTimes(1);
    expect(acceptInvite).toHaveBeenCalledExactlyOnceWith("tok", { display_name: "지은" });
  });

  it("초대 수락이 실패하면 서버 메시지를 보여준다", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u-1" } } } });
    acceptInvite.mockRejectedValue(new Error("초대가 만료되었습니다"));

    renderAt("/auth/callback?invite_token=tok");

    expect(await screen.findByText("초대가 만료되었습니다")).toBeInTheDocument();
  });

  it("세션이 끝내 오지 않으면 시간 초과 안내를 보여준다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderAt("/auth/callback");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    await waitFor(() => expect(screen.getByText(/이 기기에서 인증을 완료할 수 없습니다/)).toBeInTheDocument());
    expect(checkAuth).not.toHaveBeenCalled();
  });
});
