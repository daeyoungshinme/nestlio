import { describe, expect, it } from "vitest";
import { monthsToGoalWithExtra } from "@/utils/goalAcceleration";

describe("monthsToGoalWithExtra", () => {
  it("추가 저축만큼 달성 개월이 줄어든다", () => {
    // 남은 1,200,000원: 월 100,000 → 12개월, 월 150,000 → 8개월
    expect(monthsToGoalWithExtra("1200000", "0", "100000", 50000)).toEqual({ baseMonths: 12, newMonths: 8, monthsSaved: 4 });
  });

  it("나머지가 있으면 한 달을 올림한다", () => {
    expect(monthsToGoalWithExtra("1000000", "0", "300000", 0)).toEqual({ baseMonths: 4, newMonths: 4, monthsSaved: 0 });
  });

  it("월 계획이 없으면 기준 개월은 null, 추가액이 있으면 그걸로 계산", () => {
    expect(monthsToGoalWithExtra("1000000", "0", "0", 0)).toEqual({ baseMonths: null, newMonths: null, monthsSaved: 0 });
    expect(monthsToGoalWithExtra("1000000", "0", "0", 250000)).toEqual({ baseMonths: null, newMonths: 4, monthsSaved: 0 });
  });

  it("이미 달성했으면 0개월", () => {
    expect(monthsToGoalWithExtra("1000000", "1200000", "100000", 0)).toEqual({ baseMonths: 0, newMonths: 0, monthsSaved: 0 });
  });
});
