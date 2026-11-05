import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useDashboardBootstrap = vi.fn();
const loadedList = { data: [], error: null, isError: false, isLoading: false, refetch: vi.fn() };

vi.mock("@/api/dashboard", () => ({
  fetchDashboard: () =>
    Promise.resolve({
      insights: [],
      trend: [],
      owner_totals: [],
      owner_overspend_highlights: [],
      investable_surplus: "0",
      surplus_allocation: null,
      savings_streak_months: 0,
    }),
}));
vi.mock("@/hooks/useReferenceData", () => ({
  useDashboardBootstrap: (...args: unknown[]) => useDashboardBootstrap(...args),
  useCategories: () => loadedList,
  useAccounts: () => loadedList,
  useMe: () => ({ data: undefined }),
}));
vi.mock("@/hooks/usePlanQueries", () => ({
  useCashflowPlan: () => ({ data: undefined }),
  useSavingsProductsPlan: () => ({ data: undefined }),
}));
vi.mock("@/hooks/useNotifications", () => ({ useNotifications: () => ({ data: [] }) }));
vi.mock("@/hooks/useInvalidateTransactionRelated", () => ({
  useCreateTransaction: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (state: { userId: string }) => unknown) => select({ userId: "me" }),
}));

// 이 테스트의 관심사는 빠른 추가 모달뿐이라 홈 카드는 비운다.
vi.mock("@/components/home/CoachingInsights", () => ({ default: () => null }));
vi.mock("@/components/review/SavingsReviewLinkCard", () => ({ default: () => null }));
vi.mock("@/components/home/HomeGoalHero", () => ({ default: () => null }));
vi.mock("@/components/home/MonthFlowCard", () => ({ default: () => null }));
vi.mock("@/components/dashboard/MonthlyRetrospectiveCard", () => ({ default: () => null }));
vi.mock("@/components/dashboard/TodayScheduleCard", () => ({ default: () => null }));
vi.mock("@/components/dashboard/TodoCard", () => ({ default: () => null }));
vi.mock("@/components/common/QuickAddFab", () => ({
  default: ({ onClick }: { onClick: () => void }) => <button type="button" onClick={onClick}>빠른 추가</button>,
}));
vi.mock("@/components/transactions/TransactionForm", () => ({ default: () => <p>입력 양식</p> }));

const { default: DashboardPage } = await import("@/pages/DashboardPage");

async function openQuickAdd() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "빠른 추가" }));
}

describe("DashboardPage 빠른 추가 — bootstrap을 아직 못 받은 상태", () => {
  beforeEach(() => {
    useDashboardBootstrap.mockReset();
  });

  it("로딩 중에 열면 크래시 없이 양식 대신 스켈레톤을 보여준다", async () => {
    useDashboardBootstrap.mockReturnValue({ ...loadedList, data: undefined, isLoading: true });
    await openQuickAdd();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("입력 양식")).not.toBeInTheDocument();
  });

  it("실패한 뒤 열면 크래시 없이 에러 문구를 보여준다", async () => {
    useDashboardBootstrap.mockReturnValue({
      ...loadedList,
      data: undefined,
      isError: true,
      error: new Error(""),
    });
    await openQuickAdd();
    expect(screen.getByText("입력 양식을 불러오지 못했습니다.")).toBeInTheDocument();
  });

  it("받은 뒤에는 양식을 보여준다", async () => {
    useDashboardBootstrap.mockReturnValue({
      ...loadedList,
      data: { savings_products: [], users: [], settings: { couple_photo_url: null } },
    });
    await openQuickAdd();
    expect(screen.getByText("입력 양식")).toBeInTheDocument();
  });
});
