import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CashflowPlanItemOut } from "@/types";

const loaded = { data: [], error: null, isError: false, isLoading: false, refetch: vi.fn() };
const failed = { data: undefined, error: new Error(""), isError: true, isLoading: false, refetch: vi.fn() };
const useAccounts = vi.fn();

vi.mock("@/hooks/useReferenceData", () => ({
  useAccounts: () => useAccounts(),
  useSavingsProducts: () => loaded,
  useUsers: () => loaded,
}));
vi.mock("@/hooks/useInvalidateTransactionRelated", () => ({
  useCreateTransaction: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (select: (state: { userId: string }) => unknown) => select({ userId: "me" }),
}));
vi.mock("@/components/transactions/TransactionForm", () => ({ default: () => <p>입력 양식</p> }));

const { default: CashflowPlanQuickAddModal } = await import("@/components/financialPlan/CashflowPlanQuickAddModal");

const item = { id: 1, name: "월세", amount: "500000", section: "fixed", category_id: 2 } as CashflowPlanItemOut;

function renderModal() {
  render(<CashflowPlanQuickAddModal item={item} categories={[]} onClose={vi.fn()} onAdded={vi.fn()} />);
}

// 참조 데이터 조회가 실패하면 스켈레톤에 영원히 갇히지 않고 에러·다시 시도를 보여야 한다.
describe("CashflowPlanQuickAddModal", () => {
  it("shows an error instead of a permanent skeleton when a lookup fails", () => {
    useAccounts.mockReturnValue(failed);
    renderModal();
    expect(screen.getByText("입력 양식을 불러오지 못했습니다.")).toBeInTheDocument();
    expect(screen.queryByText("입력 양식")).not.toBeInTheDocument();
  });

  it("shows the form once every lookup has data", () => {
    useAccounts.mockReturnValue(loaded);
    renderModal();
    expect(screen.getByText("입력 양식")).toBeInTheDocument();
  });
});
