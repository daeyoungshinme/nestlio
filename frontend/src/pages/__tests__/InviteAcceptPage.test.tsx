import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signUp = vi.fn();
const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => signUp(...args),
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
    },
  },
}));
const checkAuth = vi.fn(async () => {});
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (s: { checkAuth: typeof checkAuth }) => unknown) => select({ checkAuth }),
}));
const fetchInviteByToken = vi.fn();
const acceptInvite = vi.fn();
vi.mock("@/api/invites", () => ({
  fetchInviteByToken: (...args: unknown[]) => fetchInviteByToken(...args),
  acceptInvite: (...args: unknown[]) => acceptInvite(...args),
}));

const { default: InviteAcceptPage } = await import("@/pages/InviteAcceptPage");

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
});
