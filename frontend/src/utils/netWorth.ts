import type { LoanOut, SavingsProductOut } from "@/types";
import { sumAmounts } from "@/utils/amount";

/** 백엔드 `savings_total`은 저축·투자 상품 전체(부동산 포함) 합계다(app/services/net_worth_service.py).
 * 순자산 화면에서 "저축·투자"와 "부동산"을 별개 항목으로 보여줄 때는 항상 이 함수로 구성값을
 * 파생시킨다 — 화면마다 따로 빼서 계산하면 한쪽만 고치고 다른 쪽을 놓쳐 숫자가 어긋난다. */
export function splitSavingsAndRealEstate(
  savingsTotal: number,
  products: SavingsProductOut[] | undefined,
): { savingsInvestmentTotal: number; realEstateTotal: number } {
  const realEstateTotal =
    sumAmounts(products?.filter((p) => p.product_type === "real_estate"), (p) => p.current_balance);
  return { savingsInvestmentTotal: savingsTotal - realEstateTotal, realEstateTotal };
}

/** 부동산 상품과 growlio_account_id로 짝지어진 담보대출(app/services/real_estate_service.mortgage_loan_ids와 같은 매칭).
 * 손으로 만든 대출은 짝을 알 수 없어 들어가지 않는다. */
export function realEstateMortgages(
  products: SavingsProductOut[] | undefined,
  loans: LoanOut[] | undefined,
): LoanOut[] {
  const realEstateGrowlioIds = new Set(
    (products ?? [])
      .filter((p) => p.product_type === "real_estate" && p.growlio_account_id)
      .map((p) => p.growlio_account_id as string),
  );
  return (loans ?? []).filter((loan) => loan.growlio_account_id && realEstateGrowlioIds.has(loan.growlio_account_id));
}

/** 자산구성 도넛의 부동산 조각을 시세 총액이 아니라 담보대출을 뺀 순액으로 보여주기 위한 계산.
 * growlio_account_id로 부동산 자산과 짝지어진 대출만 골라 뺀다
 * (app/services/real_estate_service.py의 담보대출 연동과 동일한 매칭 방식). */
export function computeRealEstateNet(
  realEstateTotal: number,
  products: SavingsProductOut[] | undefined,
  loans: LoanOut[] | undefined,
): number {
  return Math.max(realEstateTotal - sumAmounts(realEstateMortgages(products, loans), (loan) => loan.balance), 0);
}

/** 순자산 목표 "부동산 제외"가 순자산에서 빼는 값 — 부동산 잔액 − 짝 담보대출(백엔드 real_estate_service.real_estate_net).
 * 도넛과 달리 0으로 자르지 않는다(담보대출이 시세보다 크면 빼는 값이 음수 = 순자산이 늘어난다). */
export function realEstateNetForGoal(products: SavingsProductOut[] | undefined, loans: LoanOut[] | undefined): number {
  const realEstateTotal = sumAmounts(
    products?.filter((p) => p.product_type === "real_estate"),
    (p) => p.current_balance,
  );
  return realEstateTotal - sumAmounts(realEstateMortgages(products, loans), (loan) => loan.balance);
}
