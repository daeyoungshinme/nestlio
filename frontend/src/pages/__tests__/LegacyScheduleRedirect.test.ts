import { describe, expect, it } from "vitest";
import { legacyScheduleTarget } from "@/pages/LegacyScheduleRedirect";

describe("legacyScheduleTarget", () => {
  it("date 없이 들어오면 가계부 일정 보기로", () => {
    expect(legacyScheduleTarget(new URLSearchParams(""))).toBe("/transactions?view=일정");
  });
  it("date를 넘겨 그 날 모달을 열게 한다", () => {
    expect(legacyScheduleTarget(new URLSearchParams("date=2026-09-26"))).toBe(
      "/transactions?view=일정&date=2026-09-26",
    );
  });
});
