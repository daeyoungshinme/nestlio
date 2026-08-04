import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import SkeletonCard from "@/components/common/SkeletonCard";
import TransactionForm from "@/components/transactions/TransactionForm";
import { fetchCategories } from "@/api/categories";
import { fetchAccounts } from "@/api/accounts";
import { fetchSavingsProducts } from "@/api/savingsProducts";
import { deleteTransaction, fetchTransaction, updateTransaction } from "@/api/transactions";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { useInvalidateTransactionRelated } from "@/hooks/useInvalidateTransactionRelated";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import { TOUCH_TARGET_ROW } from "@/constants/uiSizes";

export default function TransactionEditPage() {
  const { id } = useParams<{ id: string }>();
  const txId = Number(id);
  const navigate = useNavigate();
  const invalidateAll = useInvalidateTransactionRelated();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: categories } = useQuery({
    queryKey: QUERY_KEYS.categories(),
    queryFn: () => fetchCategories(),
    staleTime: STALE_TIME.LONG,
  });
  const { data: accounts } = useQuery({
    queryKey: QUERY_KEYS.accounts,
    queryFn: fetchAccounts,
    staleTime: STALE_TIME.LONG,
  });
  const { data: savingsProducts } = useQuery({
    queryKey: QUERY_KEYS.savingsProducts,
    queryFn: fetchSavingsProducts,
    staleTime: STALE_TIME.MEDIUM,
  });
  const { data: tx, isLoading } = useQuery({
    queryKey: QUERY_KEYS.transaction(txId),
    queryFn: () => fetchTransaction(txId),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateTransaction>[1]) => updateTransaction(txId, payload),
    onSuccess: () => {
      invalidateAll();
      toast("거래를 수정했습니다.", "success");
      navigate("/transactions");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTransaction(txId),
    onSuccess: () => {
      invalidateAll();
      toast("거래를 삭제했습니다.", "success");
      navigate("/transactions");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (!categories || !accounts || !savingsProducts || isLoading || !tx) {
    return <SkeletonCard rows={4} />;
  }

  return (
    <div className="max-w-sm space-y-4">
      <Link
        to="/transactions"
        className={`gap-2 -ml-1 px-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 ${TOUCH_TARGET_ROW} w-auto inline-flex`}
      >
        <ArrowLeft size={18} />
        가계부
      </Link>
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">거래 수정</h1>
      <div className="card">
        <TransactionForm
          categories={categories}
          accounts={accounts}
          savingsProducts={savingsProducts}
          layout="stack"
          isNew={false}
          submitLabel="저장"
          submitting={updateMutation.isPending}
          initialValues={{
            amount: tx.amount,
            type: tx.type,
            category_id: String(tx.category.id),
            transaction_date: tx.transaction_date,
            description: tx.description ?? "",
            payment_method: tx.payment_method ?? "",
            account_id: tx.account ? String(tx.account.id) : "",
            savings_product_id: tx.savings_product_id ? String(tx.savings_product_id) : "",
          }}
          onSubmit={(payload) => updateMutation.mutate(payload)}
        />
      </div>
      <Button variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirmDelete(true)}>
        삭제
      </Button>

      {confirmDelete && (
        <ConfirmModal
          message="이 거래를 삭제할까요? 되돌릴 수 없습니다."
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
