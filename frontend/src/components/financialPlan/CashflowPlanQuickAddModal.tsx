import Modal from "@/components/common/Modal";
import SkeletonCard from "@/components/common/SkeletonCard";
import TransactionForm from "@/components/transactions/TransactionForm";
import { useAuthStore } from "@/stores/authStore";
import { useCreateTransaction } from "@/hooks/useInvalidateTransactionRelated";
import { useAccounts, useSavingsProducts, useUsers } from "@/hooks/useReferenceData";
import { currentDateIso } from "@/utils/date";
import { toast } from "@/utils/toast";
import type { CashflowPlanItemOut, CategoryOut } from "@/types";

interface Props {
  item: CashflowPlanItemOut;
  /** 수입 계획 항목도 등록할 수 있어야 하므로 지출 전용이 아닌 전체 카테고리를 받는다. */
  categories: CategoryOut[];
  onClose: () => void;
  /** 거래 등록이 끝난 뒤 호출 — 부모가 현금흐름계획/예산 쿼리를 무효화한다
   * (거래 목록/대시보드 등은 useCreateTransaction이 직접 처리). */
  onAdded: () => void;
}

export default function CashflowPlanQuickAddModal({ item, categories, onClose, onAdded }: Props) {
  const { data: accounts } = useAccounts();
  const { data: savingsProducts } = useSavingsProducts();
  const { data: users } = useUsers();
  const currentUserId = useAuthStore((s) => s.userId);

  const quickAddMutation = useCreateTransaction(() => {
    onAdded();
    onClose();
    toast("가계부에 추가했습니다.", "success");
  });

  return (
    <Modal onClose={onClose} title="가계부에 추가">
      <div className="p-6 overflow-y-auto">
        {item.category_id === null && (
          <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
            이 계획 항목엔 카테고리가 없어요. 아래에서 카테고리를 확인해 주세요.
          </p>
        )}
        {!accounts || !savingsProducts || !users ? (
          <SkeletonCard rows={4} />
        ) : (
          <TransactionForm
            categories={categories}
            accounts={accounts}
            savingsProducts={savingsProducts}
            users={users}
            currentUserId={currentUserId ?? undefined}
            layout="stack"
            isNew={false}
            submitLabel="추가"
            submitting={quickAddMutation.isPending}
            initialValues={{
              amount: item.amount,
              type: item.section === "income" ? "income" : "expense",
              category_id: item.category_id !== null ? String(item.category_id) : "",
              transaction_date: currentDateIso(),
              description: item.category_id === null ? item.name : "",
            }}
            onSubmit={(payload) => quickAddMutation.mutate(payload)}
          />
        )}
      </div>
    </Modal>
  );
}
