import { sumAmounts } from "@/utils/amount";
import { formatKrw } from "@/utils/format";
import type { TransactionOut } from "@/types";

export interface DayCashflow {
  income: number;
  expense: number;
  /** 수입 − 지출. */
  net: number;
  /** 저축 카테고리를 뺀 거래 수 — 0이면 순액을 보여줄 거리가 없다(저축만 있는 날). */
  count: number;
}

/** 하루치 거래의 수입·지출·순액 — 가계부 달력 칸(`LedgerDayCell`)과 날짜 상세(`LedgerDayDetail`)가 같은 기준을 쓴다.
 * 저축/투자(저축 카테고리) 거래는 돈이 자산으로 옮겨 간 것이라 수입·지출 어느 쪽에도 넣지 않는다. */
export function dayCashflow(transactions: readonly TransactionOut[]): DayCashflow {
  const flows = transactions.filter((tx) => !tx.category.is_savings);
  const income = sumAmounts(flows.filter((tx) => tx.type === "income"), (tx) => tx.amount);
  const expense = sumAmounts(flows.filter((tx) => tx.type === "expense"), (tx) => tx.amount);
  return { income, expense, net: income - expense, count: flows.length };
}

/** 순액 표기 — 양수 "+1,000원", 음수 "-1,000원", 0은 부호 없이 "0원". */
export function formatSignedNet(net: number): string {
  if (net === 0) return formatKrw(0);
  return `${net > 0 ? "+" : "-"}${formatKrw(Math.abs(net))}`;
}
