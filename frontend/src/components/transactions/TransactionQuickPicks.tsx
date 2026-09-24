import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Tabs from "@/components/common/Tabs";
import { fetchRecentTransactions } from "@/api/transactions";
import { fetchCashflowPlan } from "@/api/cashflowPlan";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_COMPACT_MOBILE_ONLY } from "@/constants/uiSizes";
import { EXPENSE_TYPE_FILTER_OPTIONS } from "@/components/transactions/TransactionFilterBar";
import { categoryTypeBadgeStyle } from "@/utils/colors";
import { formatKrw } from "@/utils/format";
import type { CashflowPlanItemOut, TransactionOut, TransactionType, UserOut } from "@/types";

export type UiType = "income" | "expense" | "savings";

const EXPENSE_TYPE_GROUPS = EXPENSE_TYPE_FILTER_OPTIONS.filter(
  (o): o is { value: "fixed" | "variable" | "irregular"; label: string } => o.value !== "all",
);

const QUICK_TABS = ["계획", "최근"] as const;
type QuickTab = (typeof QUICK_TABS)[number];

const QUICK_CHIP_CLASS = `shrink-0 px-3 rounded-full border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${TOUCH_TARGET_COMPACT_MOBILE_ONLY}`;

function QuickChip({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={QUICK_CHIP_CLASS}>
      {label}
    </button>
  );
}

function recentChipLabel(tx: TransactionOut): string {
  const parts = [tx.category.name, formatKrw(tx.amount)];
  if (tx.description) parts.push(tx.description);
  return parts.join(" · ");
}

/** "이번 달 계획" 칩 라벨: 계획 항목 이름 · 금액 (· 12개월 분할 회차) (· 소유자, 가구원 2명 이상 & 수입 항목일 때만). */
function planChipLabel(item: CashflowPlanItemOut, users: UserOut[]): string {
  const parts = [item.name, formatKrw(item.amount)];
  if (item.installment_total) parts.push(`${item.installment_no}/${item.installment_total}`);
  if (users.length > 1 && item.owner_user_id) {
    const owner = users.find((u) => u.id === item.owner_user_id);
    if (owner) parts.push(owner.display_name);
  }
  return parts.join(" · ");
}

interface Props {
  uiType: UiType;
  /** 폼에서 고른 거래 날짜("YYYY-MM-DD") — "계획" 칩은 이 날짜가 속한 달의 현금흐름계획을 보여준다. */
  transactionDate: string;
  users: UserOut[];
  submitting?: boolean;
  /** "최근" 칩 탭 = 그 내역을 현재 날짜로 즉시 등록. */
  onQuickAdd: (tx: TransactionOut) => void;
  /** "계획" 칩 탭 = 폼만 프리필(즉시 등록하지 않음). */
  onApplyPlanItem: (item: CashflowPlanItemOut) => void;
}

/** 새 거래 등록 폼 상단의 빠른 입력 칩 — "계획"(이번 달 현금흐름계획 항목)·"최근"(최근 등록 내역) 탭,
 * 저축/투자 모드에선 "자주 쓰는 항목". 새 거래 컨텍스트에서만 렌더링된다(TransactionForm의 isNew). */
export default function TransactionQuickPicks({
  uiType,
  transactionDate,
  users,
  submitting,
  onQuickAdd,
  onApplyPlanItem,
}: Props) {
  const [quickTab, setQuickTab] = useState<QuickTab>("계획");

  const recentType: TransactionType = uiType === "income" ? "income" : "expense";
  const recentIsSavings = uiType === "savings";
  const recentLimit = uiType === "expense" ? 12 : 8;
  const { data: recentItems } = useQuery({
    queryKey: QUERY_KEYS.recentTransactions({ type: recentType, is_savings: recentIsSavings, limit: recentLimit }),
    queryFn: () => fetchRecentTransactions({ type: recentType, is_savings: recentIsSavings, limit: recentLimit }),
    staleTime: STALE_TIME.SHORT,
  });

  const recentGroups =
    uiType === "expense"
      ? EXPENSE_TYPE_GROUPS.map((group) => ({
          ...group,
          items: (recentItems ?? []).filter((tx) => tx.category.type === group.value),
        })).filter((group) => group.items.length > 0)
      : [];
  const hasRecentContent = recentGroups.length > 0 || Boolean(recentItems && recentItems.length > 0);

  /** "이번 달 계획" 칩: 폼에서 선택한 거래 날짜가 속한 달의 현금흐름계획 항목 (수입/고정/변동/비정기지출만 — 저축/투자는 계획 개념이 없음). */
  const yearMonth = transactionDate.slice(0, 7);
  const { data: planData } = useQuery({
    queryKey: QUERY_KEYS.cashflowPlan(yearMonth),
    queryFn: () => fetchCashflowPlan(yearMonth),
    staleTime: STALE_TIME.SHORT,
    enabled: uiType !== "savings",
  });
  const planItems = (planData?.items ?? []).filter((item) => Number(item.amount) > 0);
  const planGroups =
    uiType === "expense"
      ? EXPENSE_TYPE_GROUPS.map((group) => ({
          ...group,
          items: planItems.filter((item) => item.section === group.value),
        })).filter((group) => group.items.length > 0)
      : [];
  const planFlatItems = uiType === "income" ? planItems.filter((item) => item.section === "income") : [];
  const hasPlanContent = planGroups.length > 0 || planFlatItems.length > 0;

  return (
    <>
      {uiType === "savings" && recentItems && recentItems.length > 0 && (
        <div className="w-full">
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>자주 쓰는 항목</label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recentItems.map((tx) => (
              <QuickChip key={tx.id} label={recentChipLabel(tx)} disabled={submitting} onClick={() => onQuickAdd(tx)} />
            ))}
          </div>
        </div>
      )}

      {uiType !== "savings" && (hasPlanContent || hasRecentContent) && (
        <div className="w-full">
          <Tabs tabs={QUICK_TABS} activeTab={quickTab} onChange={setQuickTab} variant="pill" />
          <div className="mt-2">
            {quickTab === "계획" ? (
              hasPlanContent ? (
                <div className="flex flex-col gap-2">
                  {planGroups.map((group) => (
                    <div key={group.value}>
                      <span
                        className={`inline-block mb-1 px-2 py-0.5 rounded text-[11px] font-medium ${categoryTypeBadgeStyle(group.value)}`}
                      >
                        {group.label}
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {group.items.map((item) => (
                          <QuickChip key={item.id} label={planChipLabel(item, users)} onClick={() => onApplyPlanItem(item)} />
                        ))}
                      </div>
                    </div>
                  ))}
                  {planFlatItems.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {planFlatItems.map((item) => (
                        <QuickChip key={item.id} label={planChipLabel(item, users)} onClick={() => onApplyPlanItem(item)} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className={`${LABEL_SM} py-1`}>이번 달 계획에 등록된 항목이 없어요.</p>
              )
            ) : hasRecentContent ? (
              <div className="flex flex-col gap-2">
                {recentGroups.length > 0 ? (
                  recentGroups.map((group) => (
                    <div key={group.value}>
                      <span
                        className={`inline-block mb-1 px-2 py-0.5 rounded text-[11px] font-medium ${categoryTypeBadgeStyle(group.value)}`}
                      >
                        {group.label}
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {group.items.map((tx) => (
                          <QuickChip key={tx.id} label={recentChipLabel(tx)} disabled={submitting} onClick={() => onQuickAdd(tx)} />
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(recentItems ?? []).map((tx) => (
                      <QuickChip key={tx.id} label={recentChipLabel(tx)} disabled={submitting} onClick={() => onQuickAdd(tx)} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className={`${LABEL_SM} py-1`}>최근 등록한 내역이 없어요.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
