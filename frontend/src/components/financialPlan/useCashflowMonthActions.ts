import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  copyPreviousMonthCashflowPlan,
  deleteCashflowPlanItem,
  fetchCashflowPlan,
  splitCashflowPlanItem,
  upsertCashflowPlanItem,
} from "@/api/cashflowPlan";
import { PLAN_RELATED_KEYS } from "@/constants/queryKeys";
import { invalidateKeys } from "@/utils/queryClient";
import { shiftYearMonth } from "@/utils/date";
import { formatYearMonth } from "@/utils/format";
import { toast } from "@/utils/toast";
import type { BudgetRowOut, CashflowPlanItemOut, CashflowPlanListOut, CashflowSection } from "@/types";
import type { CashflowPlanItemFormValues } from "@/components/financialPlan/CashflowPlanItemForm";
import type { CashflowPlanSplitFormValues } from "@/components/financialPlan/CashflowPlanSplitForm";

export interface ItemModalState {
  section: CashflowSection;
  item: CashflowPlanItemOut | null;
}

/** 이번 달 계획 본문(CashflowPlanMonthView)의 모달 상태와 뮤테이션 — 항목 추가·수정, 이번 달만 삭제, 할부 등록,
 * 전월 복사, 다음 달 제안 반영. 저장 뒤엔 연간계획·대시보드까지 묶인 PLAN_RELATED_KEYS를 무효화한다
 * (이번 달 뷰는 연간계획의 한 달 단면이다). */
export function useCashflowMonthActions(yearMonth: string, data: CashflowPlanListOut) {
  const queryClient = useQueryClient();
  const [itemModal, setItemModal] = useState<ItemModalState | null>(null);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [recurringLinkTarget, setRecurringLinkTarget] = useState<CashflowPlanItemOut | null>(null);
  const [quickAddTarget, setQuickAddTarget] = useState<CashflowPlanItemOut | null>(null);
  const [applyingCategoryId, setApplyingCategoryId] = useState<number | null>(null);
  const nextYearMonth = shiftYearMonth(yearMonth, 1);
  const nextYearMonthLabel = formatYearMonth(nextYearMonth);

  const invalidate = () => invalidateKeys(queryClient, PLAN_RELATED_KEYS);

  const upsertMutation = useMutation({
    mutationFn: upsertCashflowPlanItem,
    onSuccess: () => {
      invalidate();
      setItemModal(null);
      toast("저장했습니다.", "success");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCashflowPlanItem,
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
      toast("삭제했습니다.", "success");
    },
  });

  const splitMutation = useMutation({
    mutationFn: splitCashflowPlanItem,
    onSuccess: (result) => {
      invalidate();
      setSplitModalOpen(false);
      toast(`${result.created}개월치 계획으로 나눠 등록했습니다.`, "success");
    },
  });

  const copyMutation = useMutation({
    mutationFn: () => copyPreviousMonthCashflowPlan(yearMonth),
    onSuccess: (result) => {
      invalidate();
      toast(
        result.copied > 0 ? `전월 계획 ${result.copied}건을 복사했습니다.` : "복사할 전월 계획 항목이 없습니다.",
        "success",
      );
    },
  });

  // "최근 3개월 평균 제안값을 다음 달 계획에 반영" — 카테고리 예산/수입 항목이 공유하는 read-modify-write.
  // 다음 달 계획을 조회해 매칭 항목이 있으면 갱신, 없으면 새로 만든다.
  const applySuggestion = async (opts: {
    match: (i: CashflowPlanItemOut) => boolean;
    section: CashflowSection;
    name: string;
    amount: string;
    categoryId: number | null;
    ownerFallback?: string | null;
  }) => {
    const nextPlan = await fetchCashflowPlan(nextYearMonth);
    const matches = nextPlan.items.filter(opts.match);
    // 같은 카테고리 항목이 여럿이면 어느 쪽을 바꿔도 합계가 제안값과 달라진다 — 직접 고르게 한다.
    if (matches.length > 1) {
      throw new Error(`${nextYearMonthLabel} 계획에 같은 항목이 여러 개라 반영할 곳을 정할 수 없어요. 직접 조정해 주세요.`);
    }
    const existing = matches[0];
    // 반복거래 연동 항목은 금액을 반복거래에서 읽어서 저장해도 바뀌지 않는다(성공 토스트만 뜨던 문제).
    if (existing?.recurring_expense_id != null) {
      throw new Error("반복거래와 연결된 항목이에요. 반복 내역의 금액을 바꿔 주세요.");
    }
    return upsertCashflowPlanItem({
      id: existing?.id ?? null,
      section: opts.section,
      year_month: nextYearMonth,
      owner_user_id: existing?.owner_user_id ?? opts.ownerFallback ?? null,
      name: existing?.name ?? opts.name,
      amount: opts.amount,
      category_id: opts.categoryId,
      sort_order: existing?.sort_order ?? 0,
    });
  };

  // 다음 달 계획도 연간계획의 한 달이라 연간 화면까지 함께 바뀐다 — 같은 invalidate()를 쓴다.
  const applyCategorySuggestionMutation = useMutation({
    mutationFn: (row: BudgetRowOut) =>
      applySuggestion({
        match: (i) => i.category_id === row.category_id,
        section: row.type,
        name: row.name,
        amount: row.suggested_amount!,
        categoryId: row.category_id,
      }),
    onMutate: (row) => setApplyingCategoryId(row.category_id),
    onSuccess: () => {
      invalidate();
      toast(`${nextYearMonthLabel} 예산에 반영했습니다.`, "success");
    },
    onSettled: () => setApplyingCategoryId(null),
  });

  const applyIncomeSuggestionMutation = useMutation({
    mutationFn: ({ item, suggestedAmount }: { item: CashflowPlanItemOut; suggestedAmount: string }) =>
      applySuggestion({
        match: (i) => i.section === "income" && i.name === item.name,
        section: "income",
        name: item.name,
        amount: suggestedAmount,
        categoryId: null,
        ownerFallback: item.owner_user_id,
      }),
    onSuccess: () => {
      invalidate();
      toast(`${nextYearMonthLabel} 계획에 반영했습니다.`, "success");
    },
  });

  const submitItem = (values: CashflowPlanItemFormValues) => {
    if (!itemModal) return;
    const { section, item } = itemModal;
    upsertMutation.mutate({
      id: item?.id ?? null,
      section,
      year_month: yearMonth,
      owner_user_id: values.owner_user_id || null,
      name: values.name,
      amount: values.amount,
      category_id: values.category_id ? Number(values.category_id) : null,
      sort_order: item?.sort_order ?? data.items.filter((i) => i.section === section).length,
    });
  };

  const submitSplit = (values: CashflowPlanSplitFormValues) => {
    splitMutation.mutate({
      section: "irregular",
      owner_user_id: null,
      name: values.name,
      total_amount: values.total_amount,
      start_year_month: values.start_year_month,
      category_id: values.category_id ? Number(values.category_id) : null,
      sort_order: data.items.filter((i) => i.section === "irregular").length,
    });
  };

  return {
    nextYearMonthLabel,
    invalidate,
    itemModal,
    openItemModal: setItemModal,
    closeItemModal: () => setItemModal(null),
    submitItem,
    savingItem: upsertMutation.isPending,
    splitModalOpen,
    openSplit: () => setSplitModalOpen(true),
    closeSplit: () => setSplitModalOpen(false),
    submitSplit,
    splitting: splitMutation.isPending,
    deleteTarget,
    askDelete: (item: CashflowPlanItemOut) => setDeleteTarget(item.id),
    confirmDelete: () => {
      if (deleteTarget !== null) deleteMutation.mutate({ id: deleteTarget, yearMonth });
    },
    cancelDelete: () => setDeleteTarget(null),
    deleting: deleteMutation.isPending,
    recurringLinkTarget,
    setRecurringLinkTarget,
    quickAddTarget,
    setQuickAddTarget,
    copyPrevious: () => copyMutation.mutate(),
    copying: copyMutation.isPending,
    applyCategorySuggestion: (row: BudgetRowOut) => applyCategorySuggestionMutation.mutate(row),
    applyingCategoryId,
    applyIncomeSuggestion: (item: CashflowPlanItemOut, suggestedAmount: string) =>
      applyIncomeSuggestionMutation.mutate({ item, suggestedAmount }),
    applyingIncomeSuggestion: applyIncomeSuggestionMutation.isPending,
  };
}

export type CashflowMonthActions = ReturnType<typeof useCashflowMonthActions>;
