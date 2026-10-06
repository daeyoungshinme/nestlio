import { describe, expect, it } from "vitest";
import { computeRealEstateNet, splitSavingsAndRealEstate } from "@/utils/netWorth";
import type { LoanOut, SavingsProductOut } from "@/types";

const product = (p: Partial<SavingsProductOut>) => p as SavingsProductOut;
const loan = (l: Partial<LoanOut>) => l as LoanOut;

describe("splitSavingsAndRealEstate", () => {
  it("백엔드 savings_total(부동산 포함)에서 부동산 잔액을 떼어낸다", () => {
    const products = [
      product({ product_type: "savings", current_balance: "3000000" }),
      product({ product_type: "real_estate", current_balance: "500000000" }),
      product({ product_type: "real_estate", current_balance: "100000000.00" }),
    ];

    expect(splitSavingsAndRealEstate(603000000, products)).toEqual({
      savingsInvestmentTotal: 3000000,
      realEstateTotal: 600000000,
    });
  });

  it("상품 목록이 아직 없으면 전부 저축·투자로 본다", () => {
    expect(splitSavingsAndRealEstate(1000, undefined)).toEqual({ savingsInvestmentTotal: 1000, realEstateTotal: 0 });
  });
});

describe("computeRealEstateNet", () => {
  const products = [
    product({ product_type: "real_estate", growlio_account_id: "re-1" }),
    product({ product_type: "savings", growlio_account_id: "sv-1" }),
  ];

  it("growlio 계좌로 부동산과 짝지어진 대출만 뺀다", () => {
    const loans = [
      loan({ growlio_account_id: "re-1", balance: "200000000" }),
      loan({ growlio_account_id: "sv-1", balance: "999" }), // 부동산이 아닌 상품과 연결 — 제외
      loan({ growlio_account_id: null, balance: "5000000" }), // 미연결 대출 — 제외
    ];

    expect(computeRealEstateNet(500000000, products, loans)).toBe(300000000);
  });

  it("대출이 시세보다 커도 0 아래로 내려가지 않는다", () => {
    expect(computeRealEstateNet(100, products, [loan({ growlio_account_id: "re-1", balance: "500" })])).toBe(0);
  });
});
