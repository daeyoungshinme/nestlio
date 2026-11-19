import { sumAmounts } from "@/utils/amount";
import type { CategoryAmountOut, TransactionOut } from "@/types";

/** 화면에 있는 거래로 카테고리별 지출 그룹을 만든다(금액 큰 순) — 검색 중엔 서버 분해(`category-breakdown`)가
 * 검색어를 모르므로 이걸 쓴다. 저축(저축 카테고리·상품 연결) 거래는 서버 집계처럼 뺀다. */
export function expenseGroupsFromTransactions(transactions: readonly TransactionOut[]): CategoryAmountOut[] {
  const byCategory = new Map<number, { category: TransactionOut["category"]; items: TransactionOut[] }>();
  for (const tx of transactions) {
    if (tx.type !== "expense" || tx.savings_product_id || tx.category.is_savings) continue;
    const entry = byCategory.get(tx.category.id) ?? { category: tx.category, items: [] };
    entry.items.push(tx);
    byCategory.set(tx.category.id, entry);
  }
  return Array.from(byCategory.values())
    .map(({ category, items }) => ({
      category_id: category.id,
      name: category.name,
      color: category.color,
      type: category.type,
      amount: String(sumAmounts(items, (tx) => tx.amount)),
    }))
    .sort((a, b) => Number(b.amount) - Number(a.amount));
}
