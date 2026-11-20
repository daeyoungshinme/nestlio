import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
const signInWithPassword = vi.fn();
const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => signUp(...args),
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      signOut: () => signOut(),
    },
  },
}));
const checkAuth = vi.fn(async () => {});
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: { checkAuth: typeof checkAuth }) => unknown) => select({ checkAuth }),
}));
const fetchInviteByToken = vi.fn();
const acceptInvite = vi.fn();
const toast = vi.fn();
vi.mock("@/utils/toast", () => ({ toast: (...args: unknown[]) => toast(...args) }));
vi.mock("@/api/invites", () => ({
  fetchInviteByToken: (...args: unknown[]) => fetchInviteByToken(...args),
  acceptInvite: (...args: unknown[]) => acceptInvite(...args),
}));

const { default: InviteAcceptPage } = await import("@/pages/InviteAcceptPage");
const { createMutationCache } = await import("@/utils/queryClient");

function renderAt(url: string) {
  // 실제 앱처럼 전역 MutationCache를 달아 "토스트 + 인라인" 이중 표시를 잡는다.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } }, mutationCache: createMutationCache() });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/invite/accept" element={<InviteAcceptPage />} />
          <Route path="/" element={<p>홈 화면</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchInviteByToken.mockResolvedValue({ email: "spouse@example.com" });
  acceptInvite.mockResolvedValue({});
});

// 분할(PR L·M) 전 안전망 — 초대 수락의 핵심 흐름을 고정한다.
describe("InviteAcceptPage", () => {
  it("shows an error for a link without a token", () => {
    renderAt("/invite/accept");
    expect(screen.getByText("유효하지 않은 초대 링크입니다.")).toBeInTheDocument();
  });

  it("shows a not-found message for an unknown token", async () => {
    fetchInviteByToken.mockRejectedValue({ isAxiosError: true, response: { status: 404 } });
    renderAt("/invite/accept?token=abc");
    expect(await screen.findByText("존재하지 않는 초대 링크입니다.")).toBeInTheDocument();
  });

  it("validates the password before signing up", async () => {
    renderAt("/invite/accept?token=abc");
    await screen.findByDisplayValue("spouse@example.com");
    fill("표시 이름", "배우자");
    fill("비밀번호", "short");
    fill("비밀번호 확인", "short");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByText("비밀번호는 8자 이상이어야 합니다")).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("signs up with the invited email and accepts right away when a session is issued", async () => {
    signUp.mockResolvedValue({ data: { user: { id: "u-2" }, session: { access_token: "t" } }, error: null });
    renderAt("/invite/accept?token=abc");
    await screen.findByDisplayValue("spouse@example.com");
    fill("표시 이름", "배우자");
    fill("비밀번호", "password123");
    fill("비밀번호 확인", "password123");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByText("홈 화면")).toBeInTheDocument();
    expect(signUp.mock.calls[0][0]).toMatchObject({ email: "spouse@example.com", password: "password123" });
    expect(acceptInvite).toHaveBeenCalledWith("abc", { display_name: "배우자" });
    expect(checkAuth).toHaveBeenCalledOnce();
  });

  it("waits for email confirmation when sign-up returns no session", async () => {
    signUp.mockResolvedValue({ data: { user: { id: "u-2" }, session: null }, error: null });
    renderAt("/invite/accept?token=abc");
    await screen.findByDisplayValue("spouse@example.com");
    fill("표시 이름", "배우자");
    fill("비밀번호", "password123");
    fill("비밀번호 확인", "password123");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByText(/가입 확인 이메일을 발송했습니다/)).toBeInTheDocument();
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("switches to sign-in when the email is already registered, then accepts", async () => {
    signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: "User already registered" } });
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u-2" } }, error: null });
    renderAt("/invite/accept?token=abc");
    await screen.findByDisplayValue("spouse@example.com");
    fill("표시 이름", "배우자");
    fill("비밀번호", "password123");
    fill("비밀번호 확인", "password123");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    const signInButton = await screen.findByRole("button", { name: "로그인하고 초대 수락" });
    fill("기존 비밀번호", "existing-pass");
    fireEvent.click(signInButton);

    await waitFor(() => expect(acceptInvite).toHaveBeenCalledWith("abc", { display_name: "배우자" }));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "spouse@example.com", password: "existing-pass" });
  });

  it("treats an empty identities list as an already-registered email", async () => {
    // 이메일 확인이 켜져 있으면 Supabase는 이미 가입된 이메일에도 오류 없이 identities: []를 돌려준다.
    signUp.mockResolvedValue({ data: { user: { id: "u-2", identities: [] }, session: null }, error: null });
    renderAt("/invite/accept?token=abc");
    await screen.findByDisplayValue("spouse@example.com");
    fill("표시 이름", "배우자");
    fill("비밀번호", "password123");
    fill("비밀번호 확인", "password123");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByRole("button", { name: "로그인하고 초대 수락" })).toBeInTheDocument();
    expect(screen.queryByText(/가입 확인 이메일을 발송했습니다/)).not.toBeInTheDocument();
  });

  it("signs out and shows the error once when accepting fails after sign-in", async () => {
    signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: "User already registered" } });
    signInWithPassword.mockResolvedValue({ data: { user: { id: "u-2" } }, error: null });
    acceptInvite.mockRejectedValue({ isAxiosError: true, response: { status: 403, data: { detail: "가구 정원이 찼습니다." } } });
    renderAt("/invite/accept?token=abc");
    await screen.findByDisplayValue("spouse@example.com");
    fill("표시 이름", "배우자");
    fill("비밀번호", "password123");
    fill("비밀번호 확인", "password123");
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));
    const signInButton = await screen.findByRole("button", { name: "로그인하고 초대 수락" });
    fill("기존 비밀번호", "existing-pass");
    fireEvent.click(signInButton);

    expect(await screen.findByText("가구 정원이 찼습니다.")).toBeInTheDocument();
    expect(signOut).toHaveBeenCalledOnce();
    expect(checkAuth).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
