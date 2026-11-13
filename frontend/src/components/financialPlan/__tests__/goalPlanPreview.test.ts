import { describe, expect, it } from "vitest";
import { draftFromGoal, EMPTY_GOAL_DRAFT } from "@/components/financialPlan/goalDraft";
import { draftCurrentAmount, previewGoalPlan } from "@/components/financialPlan/goalForm/goalPlanPreview";
import type { AccountWithBalanceOut, FinancialGoalOut, LoanOut, SavingsProductOut } from "@/types";

const OPENED_AT = new Date(2026, 10, 13);

const PRODUCT = { id: 5, current_balance: "300000" } as SavingsProductOut;
const ACCOUNT = { account: { id: 7 }, balance: "200000" } as AccountWithBalanceOut;
const LOAN = { id: 9, balance: "100000" } as LoanOut;
const SOURCES = { savingsProducts: [PRODUCT], accounts: [ACCOUNT], loans: [LOAN] };
type Draft = ReturnType<typeof draftFromGoal>;

function preview(draft: Draft, existingGoal: FinancialGoalOut | null, currentAge = "") {
  return previewGoalPlan({
    draft,
    existingGoal,
    openedAt: OPENED_AT,
    currentAge,
    currentAmount: draftCurrentAmount(draft, SOURCES),
  });
}

function makeGoal(overrides: Partial<FinancialGoalOut>): FinancialGoalOut {
  return {
    id: 1,
    kind: "goal",
    priority: 1,
    name: "목표",
    description: null,
    target_age: null,
    target_date: "2027-11-30",
    required_amount: "1200000",
    monthly_saving_amount: "0",
    planned_monthly_amount: "0",
    expected_annual_return_pct: null,
    eta_with_return_year_month: null,
    current_amount: "0",
    progress_pct: "0",
    sort_order: 0,
    funding_sources: [],
    months_remaining: 7,
    suggested_monthly_amount: "77777",
    eta_year_month: null,
    ahead_behind_months: null,
    start_date: null,
    status: "active",
    effective_status: null,
    created_by_id: null,
    completed_at: null,
    monthly_targets: [],
    combined_members: [],
    overlap_amount: null,
    exclude_real_estate: false,
    ...overrides,
  };
}

describe("previewGoalPlan", () => {
  it("새 목표는 (필요 − 현재) ÷ 남은 달로 계산한다(일은 무시하고 달 차이)", () => {
    const draft = { ...EMPTY_GOAL_DRAFT, target_date: "2027-11-01", required_amount: "1200000", current_amount: "0" };
    expect(preview(draft, null)).toEqual({
      monthsRemaining: 12,
      suggestedMonthly: 100000,
    });
  });

  it("수정 모드에서 아무것도 안 고쳤으면 백엔드 값을 그대로 쓴다", () => {
    const goal = makeGoal({});
    expect(
      preview(draftFromGoal(goal), goal),
    ).toEqual({ monthsRemaining: 7, suggestedMonthly: 77777 });
  });

  it("고친 뒤에는 다시 계산하고, 이미 넘었으면 0원", () => {
    const goal = makeGoal({});
    const draft = { ...draftFromGoal(goal), current_amount: "5000000" };
    expect(preview(draft, goal)).toEqual({
      monthsRemaining: 12,
      suggestedMonthly: 0,
    });
  });

  it("목표일 없이 나이로 정하면 현재 나이를 넣어야 계산한다", () => {
    const draft = { ...EMPTY_GOAL_DRAFT, target_age: "41", required_amount: "1200000" };
    expect(preview(draft, null)).toEqual({
      monthsRemaining: null,
      suggestedMonthly: null,
    });
    expect(preview(draft, null, "40")).toEqual({
      monthsRemaining: 12,
      suggestedMonthly: 100000,
    });
  });

  it("목표일이 지났으면 제안하지 않는다", () => {
    const draft = { ...EMPTY_GOAL_DRAFT, target_date: "2026-10-01", required_amount: "1200000" };
    expect(preview(draft, null)).toEqual({
      monthsRemaining: -1,
      suggestedMonthly: null,
    });
  });

  it("새 연동 목표는 폼 칸이 아니라 고른 자금원 잔액(대출 차감)으로 계산한다", () => {
    const draft = {
      ...EMPTY_GOAL_DRAFT,
      target_date: "2027-11-01",
      required_amount: "1600000",
      savings_product_ids: ["5"],
      account_ids: ["7"],
      loan_ids: ["9"],
    };
    expect(draftCurrentAmount(draft, SOURCES)).toBe(400000);
    expect(preview(draft, null)).toEqual({ monthsRemaining: 12, suggestedMonthly: 100000 });
  });

  it("수정 중 연동 자금원을 바꾸면 백엔드 값 대신 다시 계산한다", () => {
    const goal = makeGoal({ required_amount: "1500000" });
    const draft = { ...draftFromGoal(goal), savings_product_ids: ["5"] };
    expect(preview(draft, goal)).toEqual({ monthsRemaining: 12, suggestedMonthly: 100000 });
  });
});
