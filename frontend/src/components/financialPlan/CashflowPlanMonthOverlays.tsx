import CashflowPlanItemForm from "@/components/financialPlan/CashflowPlanItemForm";
import CashflowPlanQuickAddModal from "@/components/financialPlan/CashflowPlanQuickAddModal";
import CashflowPlanRecurringLinkModal from "@/components/financialPlan/CashflowPlanRecurringLinkModal";
import CashflowPlanSplitForm from "@/components/financialPlan/CashflowPlanSplitForm";
import type { CashflowMonthActions } from "@/components/financialPlan/useCashflowMonthActions";
import ConfirmModal from "@/components/common/ConfirmModal";
import Modal from "@/components/common/Modal";
import { SECTIONS } from "@/constants/planSections";
import type { BudgetRowOut, CategoryOut, UserOut } from "@/types";

interface Props {
  actions: CashflowMonthActions;
  yearMonth: string;
  budgetRows: BudgetRowOut[];
  users: UserOut[] | undefined;
  /** 항목·할부 폼의 카테고리(지출만). */
  expenseCategories: CategoryOut[];
  /** 반복거래 연결·가계부 즉시추가 — 수입 카테고리도 고른다. */
  allCategories: CategoryOut[];
}

/** 이번 달 계획의 모달들 — 항목 추가·수정, 할부 등록, 이번 달만 삭제 확인, 반복거래 연결, 가계부 즉시추가. */
export default function CashflowPlanMonthOverlays({ actions, yearMonth, budgetRows, users, expenseCategories, allCategories }: Props) {
  const editingItem = actions.itemModal?.item ?? null;
  // 카테고리별 "이미 계획된 금액" — 같은 카테고리 항목을 수정 중이면 그 항목 몫은 빼고 보여준다(폼이 새 금액을 더해 비교).
  const categoryPlannedTotals: Record<number, string> = Object.fromEntries(
    budgetRows.map((row) => [
      row.category_id,
      editingItem?.category_id === row.category_id ? String(Number(row.budget) - Number(editingItem.amount)) : row.budget,
    ]),
  );

  return (
    <>
      {actions.itemModal && (
        <Modal
          onClose={actions.closeItemModal}
          title={`${SECTIONS.find((s) => s.key === actions.itemModal?.section)?.label} 항목 ${editingItem ? "수정" : "추가"}`}
        >
          <div className="p-6 overflow-y-auto">
            <CashflowPlanItemForm
              section={actions.itemModal.section}
              users={users}
              categories={expenseCategories}
              categoryPlannedTotals={categoryPlannedTotals}
              initialValues={
                editingItem
                  ? {
                      name: editingItem.name,
                      owner_user_id: editingItem.owner_user_id ?? "",
                      amount: editingItem.amount,
                      category_id: editingItem.category_id !== null ? String(editingItem.category_id) : "",
                    }
                  : undefined
              }
              submitLabel={editingItem ? "저장" : "추가"}
              submitting={actions.savingItem}
              isRecurringLinked={editingItem?.recurring_expense_id != null}
              onSubmit={actions.submitItem}
            />
          </div>
        </Modal>
      )}

      {actions.splitModalOpen && (
        <Modal onClose={actions.closeSplit} title="비정기지출 할부 등록">
          <div className="p-6 overflow-y-auto">
            <CashflowPlanSplitForm
              defaultStartYearMonth={yearMonth}
              categories={expenseCategories}
              submitting={actions.splitting}
              onSubmit={actions.submitSplit}
            />
          </div>
        </Modal>
      )}

      {actions.deleteTarget !== null && (
        <ConfirmModal
          message="이번 달 금액을 삭제할까요? 다른 달에 입력된 금액은 그대로 남아요."
          loading={actions.deleting}
          onConfirm={actions.confirmDelete}
          onCancel={actions.cancelDelete}
        />
      )}

      {actions.recurringLinkTarget && (
        <CashflowPlanRecurringLinkModal
          item={actions.recurringLinkTarget}
          categories={allCategories}
          onClose={() => actions.setRecurringLinkTarget(null)}
          onLinked={actions.invalidate}
        />
      )}

      {actions.quickAddTarget && (
        <CashflowPlanQuickAddModal
          item={actions.quickAddTarget}
          categories={allCategories}
          onClose={() => actions.setQuickAddTarget(null)}
          onAdded={actions.invalidate}
        />
      )}
    </>
  );
}
