import type { SavingsProductOut } from "@/types";

/** growlio(자산관리, 별도 서비스) 프론트엔드 오리진. 비어 있으면 growlio 딥링크 CTA를 숨긴다
 * (백엔드의 GROWLIO_API_BASE_URL 미설정 시 동기화 기능이 꺼지는 것과 동일한 폴백 철학). */
export const GROWLIO_APP_URL = import.meta.env.VITE_GROWLIO_APP_URL as string | undefined;

export function growlioPortfolioUrl(growlioAccountId: string): string {
  return `${GROWLIO_APP_URL}/portfolio?account=${growlioAccountId}`;
}

/** 저축상품이 growlio 투자 포트폴리오와 연동된 투자상품인지 — growlio 딥링크 CTA 표시 조건. */
export function isGrowlioLinkedInvestment(product: SavingsProductOut): boolean {
  return product.product_type === "investment" && !!product.growlio_account_id;
}
