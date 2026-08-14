import type { LoanOut, SavingsProductOut } from "@/types";

/** 백엔드 `savings_total`은 저축·투자 상품 전체(부동산 포함) 합계다(app/services/net_worth_service.py).
 * 순자산 화면에서 "저축·투자"와 "부동산"을 별개 항목으로 보여줄 때는 항상 이 함수로 구성값을
 * 파생시킨다 — 화면마다 따로 빼서 계산하면 한쪽만 고치고 다른 쪽을 놓쳐 숫자가 어긋난다. */
export function splitSavingsAndRealEstate(
  savingsTotal: number,
  products: SavingsProductOut[] | undefined,
): { savingsInvestmentTotal: number; realEstateTotal: number } {
  const realEstateTotal =
    products?.filter((p) => p.product_type === "real_estate").reduce((sum, p) => sum + Number(p.current_balance), 0) ?? 0;
  return { savingsInvestmentTotal: savingsTotal - realEstateTotal, realEstateTotal };
}

/** 자산구성 도넛의 부동산 조각을 시세 총액이 아니라 담보대출을 뺀 순액으로 보여주기 위한 계산.
 * growlio_account_id로 부동산 자산과 짝지어진 대출만 골라 뺀다
 * (app/services/real_estate_service.py의 담보대출 연동과 동일한 매칭 방식). */
export function computeRealEstateNet(
  realEstateTotal: number,
  products: SavingsProductOut[] | undefined,
  loans: LoanOut[] | undefined,
): number {
  const realEstateGrowlioIds = new Set(
    (products ?? [])
      .filter((p) => p.product_type === "real_estate" && p.growlio_account_id)
      .map((p) => p.growlio_account_id as string),
  );
  const realEstateMortgageTotal = (loans ?? [])
    .filter((loan) => loan.growlio_account_id && realEstateGrowlioIds.has(loan.growlio_account_id))
    .reduce((sum, loan) => sum + Number(loan.balance), 0);
  return Math.max(realEstateTotal - realEstateMortgageTotal, 0);
}
