import type { SavingsProductOut } from "@/types";

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
