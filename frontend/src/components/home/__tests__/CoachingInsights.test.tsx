import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import CoachingInsights from "@/components/home/CoachingInsights";
import type { InsightOut } from "@/types";

const insight = (rule_code: string, message: string, severity: InsightOut["severity"] = "warning"): InsightOut => ({
  rule_code,
  message,
  severity,
});

describe("CoachingInsights", () => {
  // 홈의 "이번 달 흐름" 막대·여유자금 카드가 이미 보여주는 신호는 코칭에서 반복하지 않는다.
  it("hides rules the month-flow card already shows", () => {
    render(
      <MemoryRouter>
        <CoachingInsights
          insights={[
            insight("budget_overrun", "식비 예산 95% 사용", "critical"),
            insight("savings_execution", "남은 돈 중 30%만 옮겼어요", "critical"),
            insight("fixed_cost_ratio", "고정비가 소득의 55%입니다."),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/식비 예산/)).toBeNull();
    expect(screen.queryByText(/남은 돈/)).toBeNull();
    expect(screen.getByText("고정비가 소득의 55%입니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "가계부 보기" })).toHaveTextContent("보기");
  });

  it("renders nothing when only duplicated rules remain", () => {
    const { container } = render(
      <MemoryRouter>
        <CoachingInsights insights={[insight("budget_overrun", "식비 예산 95% 사용")]} />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
