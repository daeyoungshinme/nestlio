import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinancialGoalOut, UserOut } from "@/types";

// Tabs의 활성 탭 표시가 ResizeObserver를 쓴다 — jsdom에는 없다.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

vi.mock("@/api/goals", () => ({ fetchGrowlioGoalSettings: vi.fn() }));
vi.mock("@/api/netWorth", () => ({
  fetchNetWorth: vi.fn(async () => ({ current: { net_worth: "100000000" }, history: [] })),
}));
vi.mock("@/api/savingsProducts", () => ({ fetchSavingsProductsPlan: vi.fn(async () => ({ items: [] })) }));

const { default: GoalFormModal } = await import("@/components/financialPlan/GoalFormModal");
const { EMPTY_GOAL_DRAFT, emptyChallengeDraft } = await import("@/components/financialPlan/goalDraft");

type Props = Parameters<typeof GoalFormModal>[0];

function renderModal(overrides: Partial<Props> = {}) {
  const onSubmit = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GoalFormModal
          initial={EMPTY_GOAL_DRAFT}
          title="새 목표"
          submitLabel="저장"
          submitting={false}
          savingsProducts={[]}
          accounts={[]}
          loans={[]}
          existingGoal={null}
          onClose={vi.fn()}
          onSubmit={onSubmit}
          {...overrides}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onSubmit;
}

function tab(name: string) {
  return screen.getByRole("tab", { name });
}

beforeEach(() => vi.clearAllMocks());

// 분할(PR L: 유형별 폼 3개로) 전 안전망 — 유형 전환·단계 진행·저장 페이로드의 현재 동작을 고정한다.
describe("GoalFormModal", () => {
  it("offers every goal kind for a new goal, minus the household ones that already exist", () => {
    renderModal({ canCreateNetWorth: false });
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["통합", "장기 목표", "챌린지"]);
  });

  it("hides the kind tabs when editing", () => {
    renderModal({ existingGoal: { id: 1, kind: "goal" } as FinancialGoalOut, initial: { ...EMPTY_GOAL_DRAFT, name: "집" } });
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("walks a long-term goal through three steps and submits only on the last", async () => {
    const onSubmit = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("button", { name: "1. 무엇을·언제·얼마" })).toHaveAttribute("aria-current", "step");

    fireEvent.change(screen.getByLabelText(/^재무목표/), { target: { value: "내 집 마련" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("button", { name: "2. 연동할 자금원" })).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("button", { name: "3. 저축 계획" })).toHaveAttribute("aria-current", "step");
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: "goal", name: "내 집 마련" }));
  });

  it("lets an existing goal jump straight to any step", () => {
    renderModal({ existingGoal: { id: 1, kind: "goal" } as FinancialGoalOut, initial: { ...EMPTY_GOAL_DRAFT, name: "집" } });
    fireEvent.click(screen.getByRole("button", { name: "3. 저축 계획" }));
    expect(screen.getByRole("button", { name: "3. 저축 계획" })).toHaveAttribute("aria-current", "step");
  });

  it("submits a challenge from a single screen", () => {
    const onSubmit = renderModal({ initial: emptyChallengeDraft() });
    fireEvent.change(screen.getByLabelText(/^챌린지 제목/), { target: { value: "외식 줄이기" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: "challenge", name: "외식 줄이기" }));
  });

  it("switching kind keeps the typed name but resets the other fields", () => {
    const onSubmit = renderModal();
    fireEvent.change(screen.getByLabelText(/^재무목표/), { target: { value: "여행 자금" } });
    fireEvent.click(tab("챌린지"));

    expect(screen.getByLabelText(/^챌린지 제목/)).toHaveValue("여행 자금");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ kind: "challenge", name: "여행 자금", required_amount: "0" });
  });

  it("submits a net-worth goal with the real-estate exclusion", async () => {
    const onSubmit = renderModal();
    fireEvent.click(tab("순자산"));

    expect(screen.getByLabelText(/^목표 이름/)).toHaveValue("우리 순자산 목표");
    expect(await screen.findByText(/100,000,000원/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "부동산 제외" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: "net_worth", exclude_real_estate: true }));
  });

  it("requires at least one member for a combined goal", async () => {
    const users = [{ id: "u-1", display_name: "나" }] as UserOut[];
    const goals = [{ id: 5, kind: "goal", name: "집", required_amount: "300000000" }] as FinancialGoalOut[];
    const onSubmit = renderModal({ users, goals });
    fireEvent.click(tab("통합"));

    // 기본으로 가구 구성원 전원의 growlio 목표가 묶여 있다 — 모두 풀면 저장할 수 없다.
    const growlioBox = screen.getByRole("checkbox", { name: /나의 growlio 목표/ });
    expect(growlioBox).toBeChecked();
    fireEvent.click(growlioBox);
    expect(screen.getByText("묶을 목표를 하나 이상 골라 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /집/ }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "combined", member_goal_ids: ["5"], growlio_user_ids: [] }),
      ),
    );
  });

  it("does not submit a nameless goal and returns to the first step", () => {
    const onSubmit = renderModal({ existingGoal: { id: 1, kind: "goal" } as FinancialGoalOut, initial: EMPTY_GOAL_DRAFT });
    fireEvent.click(screen.getByRole("button", { name: "3. 저축 계획" }));
    const form = screen.getByRole("button", { name: "저장" }).closest("form")!;
    fireEvent.submit(form);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(form).getByRole("button", { name: "1. 무엇을·언제·얼마" })).toHaveAttribute("aria-current", "step");
  });
});
