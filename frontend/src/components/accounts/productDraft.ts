import type { SavingsProductOut } from "@/types";
import { toAmountInputValue } from "@/utils/format";

/** 저축·투자 상품 폼과 부동산 폼이 공유하는 편집 초안 필드(둘 다 SavingsProduct 행을 편집한다). */
export interface ProductBaseDraft {
  name: string;
  current_balance: string;
  principal_amount: string;
  owner_user_id: string;
}

export function baseDraftFromProduct(product: SavingsProductOut): ProductBaseDraft {
  return {
    name: product.name,
    current_balance: toAmountInputValue(product.current_balance),
    principal_amount: product.principal_amount !== null ? toAmountInputValue(product.principal_amount) : "",
    owner_user_id: product.owner_user_id ?? "",
  };
}
