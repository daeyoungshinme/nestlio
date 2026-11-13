import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import Modal from "@/components/common/Modal";
import TransactionForm from "@/components/transactions/TransactionForm";
import type { TransactionFormValues } from "@/components/transactions/TransactionForm";
import { deleteTransaction, updateTransaction } from "@/api/transactions";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useCreateTransaction, useInvalidateTransactionRelated } from "@/hooks/useInvalidateTransactionRelated";
import { toast } from "@/utils/toast";
import type { AccountWithBalanceOut, CategoryOut, SavingsProductOut, TransactionOut, UserOut } from "@/types";

function formValuesOf(tx: TransactionOut): Partial<TransactionFormValues> {
  return {
    amount: tx.amount,
    type: tx.type,
    category_id: String(tx.category.id),
    transaction_date: tx.transaction_date,
    description: tx.description ?? "",
    payment_method: tx.payment_method ?? "",
    account_id: tx.account ? String(tx.account.id) : "",
    savings_product_id: tx.savings_product_id ? String(tx.savings_product_id) : "",
    owner_user_id: tx.owner_user_id ?? "",
    card_id: tx.card_id ? String(tx.card_id) : "",
  };
}

/** 가계부 거래의 추가/수정/삭제와 그 폼·확인 모달(`useEventActions`와 같은 모양). 날짜 시트 안의 폼은 `renderForm`으로
 * 호출 화면이 그리고, 목록·＋ 버튼에서 연 폼과 삭제 확인은 반환된 `modals`를 호출 화면이 그대로 렌더한다. 추가하면
 * "취소"(되돌리기) 토스트를 띄운다. */
export function useTransactionActions({
  categories,
  accounts,
  savingsProducts,
  users,
  currentUserId,
  onSaved,
}: {
  categories: CategoryOut[] | undefined;
  accounts: AccountWithBalanceOut[] | undefined;
  savingsProducts: SavingsProductOut[] | undefined;
  users: UserOut[] | undefined;
  currentUserId: string | undefined;
  /** 추가·수정·삭제 성공 후 호출 — 가계부 날짜 시트가 폼 화면에서 목록으로 돌아가는 데 쓴다. */
  onSaved?: () => void;
}): {
  openCreate: (dateHint: string) => void;
  openEdit: (tx: TransactionOut) => void;
  renderForm: (target: "new" | TransactionOut, dateHint: string) => ReactNode;
  modals: ReactNode;
} {
  const [formTarget, setFormTarget] = useState<"new" | TransactionOut | null>(null);
  const [createDate, setCreateDate] = useState("");
  const invalidateAll = useInvalidateTransactionRelated();

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Parameters<typeof updateTransaction>[1] }) =>
      updateTransaction(id, payload),
    onSuccess: () => {
      invalidateAll();
      setFormTarget(null);
      onSaved?.();
      toast("내역을 수정했습니다.", "success");
    },
  });

  const { openDelete, deleteNow, modal: deleteModal } = useConfirmDelete<TransactionOut>({
    remove: deleteTransaction,
    message: () => "이 내역을 삭제할까요? 되돌릴 수 없습니다.",
    onDeleted: () => {
      invalidateAll();
      // 삭제는 수정 폼 안에서만 시작하므로 그 폼도 닫는다(시트는 그날 목록으로 돌아간다).
      setFormTarget(null);
      onSaved?.();
      toast("내역을 삭제했습니다.", "success");
    },
  });

  const createMutation = useCreateTransaction((created) => {
    setFormTarget(null);
    onSaved?.();
    toast("내역을 추가했습니다.", "success", {
      label: "취소",
      onClick: () => deleteNow(created.id),
    });
  });

  const renderForm = (target: "new" | TransactionOut, dateHint: string) => (
    <TransactionForm
      categories={categories ?? []}
      accounts={accounts ?? []}
      savingsProducts={savingsProducts ?? []}
      users={users ?? []}
      currentUserId={currentUserId}
      layout="stack"
      isNew={target === "new"}
      onDelete={target === "new" ? undefined : () => openDelete(target)}
      submitLabel={target === "new" ? "추가" : "저장"}
      submitting={createMutation.isPending || updateMutation.isPending}
      initialValues={target === "new" ? { transaction_date: dateHint } : formValuesOf(target)}
      editingCard={target === "new" ? null : target.card}
      onSubmit={(payload) =>
        target === "new" ? createMutation.mutate(payload) : updateMutation.mutate({ id: target.id, payload })
      }
    />
  );

  const modals = (
    <>
      {formTarget && (
        <Modal onClose={() => setFormTarget(null)} title={formTarget === "new" ? "내역 추가" : "내역 수정"}>
          <div className="p-6 overflow-y-auto">{renderForm(formTarget, createDate)}</div>
        </Modal>
      )}
      {deleteModal}
    </>
  );

  return {
    openCreate: (dateHint) => {
      setCreateDate(dateHint);
      setFormTarget("new");
    },
    openEdit: setFormTarget,
    renderForm,
    modals,
  };
}
