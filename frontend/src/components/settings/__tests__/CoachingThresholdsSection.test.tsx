import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { COACHING_THRESHOLD_PRESETS } from "@/constants/coachingPresets";
import { coachingThresholdErrors } from "@/components/settings/coachingThresholdErrors";

const setCoachingThresholds = vi.fn();
vi.mock("@/api/settings", () => ({ setCoachingThresholds: (p: unknown) => setCoachingThresholds(p) }));

const { default: CoachingThresholdsSection } = await import("@/components/settings/CoachingThresholdsSection");
const thresholds = COACHING_THRESHOLD_PRESETS[0].values;

describe("coachingThresholdErrors", () => {
  it("accepts a preset as is", () => {
    for (const preset of COACHING_THRESHOLD_PRESETS) expect(coachingThresholdErrors(preset.values)).toEqual([]);
  });

  it("rejects empty fields and reversed warn/critical pairs", () => {
    expect(coachingThresholdErrors({ ...thresholds, budget_warn_pct: "" })).toEqual(["비어 있는 칸을 채워 주세요."]);
    expect(coachingThresholdErrors({ ...thresholds, savings_rate_warn: 5, savings_rate_critical: 10 })).toEqual([
      "저축률은(는) 경고 값이 위험 값보다 커야 합니다.",
    ]);
    expect(coachingThresholdErrors({ ...thresholds, budget_warn_pct: 100, budget_critical_pct: 100 })).toEqual([
      "예산은(는) 경고 값이 위험 값보다 작아야 합니다.",
    ]);
  });
});

// 칸을 비우면 Number("")=0으로 저장돼 기준이 0%가 되던 문제 — 빈 칸이면 저장을 막는다.
describe("CoachingThresholdsSection", () => {
  it("blocks saving while a field is empty", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <CoachingThresholdsSection thresholds={thresholds} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /코칭 민감도/ }));
    fireEvent.change(screen.getByLabelText("예산 경고"), { target: { value: "" } });

    expect(screen.getByRole("alert")).toHaveTextContent("비어 있는 칸을 채워 주세요.");
    const save = screen.getByRole("button", { name: "저장" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(setCoachingThresholds).not.toHaveBeenCalled();
  });
});
