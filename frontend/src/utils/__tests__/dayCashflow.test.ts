import { describe, expect, it } from "vitest";
import { dayCashflow, formatSignedNet } from "@/utils/dayCashflow";
import type { TransactionOut } from "@/types";

const tx = (type: "income" | "expense", amount: string, isSavings = false) =>
  ({ type, amount, category: { is_savings: isSavings } }) as unknown as TransactionOut;

// 달력 칸과 날짜 상세가 같은 순액을 보여야 한다 — 저축(저축 카테고리)은 수입·지출 어느 쪽에도 넣지 않는다.
describe("dayCashflow", () => {
  it("nets income minus expense, leaving savings out of both", () => {
    expect(dayCashflow([tx("income", "50000"), tx("expense", "12000"), tx("expense", "300000", true)])).toEqual({
      income: 50000,
      expense: 12000,
      net: 38000,
      count: 2,
    });
  });

  it("counts nothing for a savings-only day", () => {
    expect(dayCashflow([tx("expense", "300000", true), tx("income", "100000", true)])).toEqual({
      income: 0,
      expense: 0,
      net: 0,
      count: 0,
    });
  });
});

describe("formatSignedNet", () => {
  it("signs non-zero amounts and leaves 0 unsigned", () => {
    expect(formatSignedNet(38000)).toBe("+38,000원");
    expect(formatSignedNet(-12000)).toBe("-12,000원");
    expect(formatSignedNet(0)).toBe("0원");
  });
});
