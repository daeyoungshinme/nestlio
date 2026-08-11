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

/** growlio의 AssetType(자체 app/enums.py) 문자열을 한글 라벨로 변환 — 가져오기 모달에서 왜
 * 특정 계좌가 "저축"으로 분류됐는지 사용자가 알 수 있도록 표시용으로만 쓴다. nestlio는
 * growlio의 enum을 직접 import하지 않으므로(느슨한 결합) 문자열 매핑을 그대로 유지한다. */
const GROWLIO_ASSET_TYPE_LABELS: Record<string, string> = {
  BANK_ACCOUNT: "은행 계좌",
  DEPOSIT: "예치금",
  STOCK_KIS: "증권",
  STOCK_KIWOOM: "증권",
  STOCK_OTHER: "증권",
  CASH_STOCK: "증권 예수금",
  REAL_ESTATE: "부동산",
  CASH_OTHER: "기타",
  OTHER: "기타",
};

export function growlioAssetTypeLabel(assetType: string): string {
  return GROWLIO_ASSET_TYPE_LABELS[assetType] ?? "기타";
}
