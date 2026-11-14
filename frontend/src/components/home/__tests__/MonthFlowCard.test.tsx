import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import MonthFlowCard from "@/components/home/MonthFlowCard";

function renderCard(props: Partial<Parameters<typeof MonthFlowCard>[0]>) {
  render(
    <MemoryRouter>
      <MonthFlowCard plan={undefined} savingsPlan={undefined} footer={<p>여유자금 영역</p>} {...props} />
    </MemoryRouter>,
  );
}

describe("MonthFlowCard", () => {
  it("계획 조회가 실패해도 카드를 숨기지 않고 다시 시도와 여유자금 영역을 보여준다", () => {
    const onRetryPlan = vi.fn();
    renderCard({ planError: true, onRetryPlan });

    expect(screen.getByText("이번 달 흐름")).toBeInTheDocument();
    expect(screen.getByText("여유자금 영역")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetryPlan).toHaveBeenCalled();
  });

  it("불러오는 중엔 '계획이 없어요'로 그리지 않는다", () => {
    renderCard({});

    expect(screen.getByText("이번 달 흐름")).toBeInTheDocument();
    expect(screen.queryByText(/아직 이번 달 계획이 없어요/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });
});
