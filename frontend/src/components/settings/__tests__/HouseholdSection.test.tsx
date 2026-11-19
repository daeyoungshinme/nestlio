import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useUsers = vi.fn();
vi.mock("@/hooks/useReferenceData", () => ({
  useUsers: () => useUsers(),
  useSpouse: () => undefined,
}));
vi.mock("@/api/invites", () => ({ fetchInvites: () => Promise.resolve([]), createInvite: vi.fn(), cancelInvite: vi.fn() }));
vi.mock("@/api/users", () => ({ removeUser: vi.fn() }));

const { default: HouseholdSection } = await import("@/components/settings/HouseholdSection");

function renderSection() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <HouseholdSection />
    </QueryClientProvider>,
  );
}

const base = { error: null, isError: false, isLoading: false, refetch: vi.fn() };

// 사용자 목록을 받기 전·실패 시 "정원 미달"로 보고 이미 두 명인 가구에 초대 폼을 띄우면 안 된다.
describe("HouseholdSection", () => {
  beforeEach(() => useUsers.mockReset());

  it("does not show the invite form while users are loading", () => {
    useUsers.mockReturnValue({ ...base, data: undefined, isLoading: true });
    renderSection();
    expect(screen.queryByLabelText("배우자 이메일")).not.toBeInTheDocument();
  });

  it("shows an error instead of the invite form when users fail to load", () => {
    useUsers.mockReturnValue({ ...base, data: undefined, isError: true, error: new Error("") });
    renderSection();
    expect(screen.getByText("가구 구성원을 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("배우자 이메일")).not.toBeInTheDocument();
  });

  it("shows the invite form only when the household has a free seat", () => {
    useUsers.mockReturnValue({ ...base, data: [{ id: "me" }] });
    renderSection();
    expect(screen.getByLabelText("배우자 이메일")).toBeInTheDocument();
  });
});
