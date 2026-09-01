import { afterEach, describe, expect, it, vi } from "vitest";
import { currentDateIso, currentYearMonth, currentYear, monthBounds, occurrenceDate, shiftDateIso, shiftYearMonth } from "@/utils/date";

afterEach(() => {
  vi.useRealTimers();
});

describe("currentDateIso / currentYearMonth / currentYear", () => {
  it("uses local time, not UTC (KST 새벽에 하루 밀리지 않는다)", () => {
    // 2026-03-10 01:30 KST = 2026-03-09 16:30 UTC. UTC 기반이면 03-09가 나온다.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T16:30:00.000Z"));
    // 이 테스트는 실행 환경 TZ가 UTC면 의미가 약해지지만, 로컬 getter를 쓴다는 것만 확인한다.
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(currentDateIso()).toBe(expected);
    expect(currentYearMonth()).toBe(expected.slice(0, 7));
    expect(currentYear()).toBe(d.getFullYear());
  });
});

describe("shiftDateIso", () => {
  it("crosses month/year boundaries", () => {
    expect(shiftDateIso("2026-02-28", 1)).toBe("2026-03-01");
    expect(shiftDateIso("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("shiftYearMonth", () => {
  it("crosses year boundary", () => {
    expect(shiftYearMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftYearMonth("2026-01", -2)).toBe("2025-11");
  });
});

describe("monthBounds", () => {
  it("returns inclusive first/last day", () => {
    expect(monthBounds("2026-02")).toEqual({ date_from: "2026-02-01", date_to: "2026-02-28" });
    expect(monthBounds("2024-02")).toEqual({ date_from: "2024-02-01", date_to: "2024-02-29" });
  });
});

describe("occurrenceDate", () => {
  it("keeps only the date part", () => {
    expect(occurrenceDate("2026-05-01T09:00:00+09:00")).toBe("2026-05-01");
    expect(occurrenceDate("2026-05-01")).toBe("2026-05-01");
  });
});
