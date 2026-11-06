import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CombinedMembersList from "@/components/financialPlan/CombinedMembersList";
import type { CombinedMemberOut, GrowlioGoalSnapshotOut } from "@/types";

const NOW = new Date("2026-11-06T09:00:00");

function snapshot(overrides: Partial<GrowlioGoalSnapshotOut> = {}): GrowlioGoalSnapshotOut {
  return {
    user_id: "me",
    is_configured: true,
    goal_amount: "300000000",
    investable_assets: "120000000",
    monthly_deposit_amount: "1000000",
    annual_deposit_goal: "12000000",
    annual_deposit_current: "9000000",
    annual_dividend_goal: null,
    estimated_annual_dividend: null,
    goal_annual_return_pct: "6.00",
    actual_return_pct: "7.26",
    retirement_target_year: null,
    synced_at: "2026-11-06T08:00:00",
    ...overrides,
  };
}

function growlioMember(overrides: Partial<CombinedMemberOut> = {}): CombinedMemberOut {
  return {
    type: "growlio",
    goal_id: null,
    user_id: "me",
    name: "나의 growlio 투자목표",
    current_amount: "120000000",
    required_amount: "300000000",
    progress_pct: "40",
    synced_at: "2026-11-06T08:00:00",
    growlio: snapshot(),
    ...overrides,
  };
}

describe("CombinedMembersList", () => {
  it("shows growlio chips and lets me refresh my own value", () => {
    const onRefresh = vi.fn();
    render(<CombinedMembersList members={[growlioMember()]} meId="me" now={NOW} onRefreshMine={onRefresh} />);
    expect(screen.getByText("수익률 7.3% / 목표 6.0%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /지금 동기화/ }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("explains an unsynced spouse and offers no refresh for them", () => {
    const spouse = growlioMember({
      user_id: "spouse",
      name: "배우자의 growlio 투자목표",
      current_amount: null,
      required_amount: null,
      progress_pct: null,
      synced_at: null,
      growlio: null,
    });
    render(<CombinedMembersList members={[spouse]} meId="me" now={NOW} onRefreshMine={vi.fn()} />);
    expect(screen.getByText("배우자가 nestlio를 열면 채워져요")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("flags a stale spouse value even in the compact card", () => {
    const spouse = growlioMember({ user_id: "spouse", synced_at: "2026-10-30T09:00:00" });
    render(<CombinedMembersList members={[spouse]} meId="me" now={NOW} compact />);
    expect(screen.getByText(/배우자가 앱을 열면 갱신돼요/)).toBeInTheDocument();
  });
});
