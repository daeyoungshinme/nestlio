import { describe, expect, it } from "vitest";
import { PRIMARY_NAV_ITEMS, pageTitleFor } from "@/constants/nav";

describe("nav", () => {
  it("하단탭은 홈/가계부/계획/목표/자산 5개", () => {
    expect(PRIMARY_NAV_ITEMS.map((i) => i.label)).toEqual(["홈", "가계부", "계획", "목표", "자산"]);
  });

  it.each([
    ["/", "홈"],
    ["/transactions", "가계부"],
    ["/transactions/import", "거래 데이터"],
    ["/plan", "계획"],
    ["/goals", "목표"],
    ["/goals/3", "목표"],
    ["/settings", "설정"],
    ["/categories", "카테고리"],
    ["/unknown", undefined],
  ])("pageTitleFor(%s) = %s", (path, expected) => {
    expect(pageTitleFor(path)).toBe(expected);
  });
});
