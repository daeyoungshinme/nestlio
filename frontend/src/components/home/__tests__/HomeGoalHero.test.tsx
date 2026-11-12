import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import HomeGoalHero from "@/components/home/HomeGoalHero";

function renderHero(goalsStatus: "loading" | "error" | "ready", onRetryGoals = vi.fn()) {
  render(
    <MemoryRouter>
      <HomeGoalHero
        goal={null}
        goalsStatus={goalsStatus}
        onRetryGoals={onRetryGoals}
        streakMonths={0}
        paceMessage={null}
        netWorth={null}
        couplePhotoUrl={null}
        partnerCheer={null}
        savingsTrend={[]}
        contribution={null}
      />
    </MemoryRouter>,
  );
  return onRetryGoals;
}

// 전에는 목표 목록(bootstrap)을 불러오는 중이거나 실패해도 "아직 목표가 없어요"가 떠서 목표가 사라진 것처럼 보였다.
describe("HomeGoalHero goal list state", () => {
  it("shows a skeleton, not the empty state, while goals are loading", () => {
    renderHero("loading");
    expect(screen.getByRole("status", { name: "로딩 중" })).toBeInTheDocument();
    expect(screen.queryByText("아직 목표가 없어요")).not.toBeInTheDocument();
  });

  it("shows a retryable error, not the empty state, when goals fail", () => {
    const onRetry = renderHero("error");
    expect(screen.queryByText("아직 목표가 없어요")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows the empty state only once goals have loaded", () => {
    renderHero("ready");
    expect(screen.getByText("아직 목표가 없어요")).toBeInTheDocument();
  });
});
