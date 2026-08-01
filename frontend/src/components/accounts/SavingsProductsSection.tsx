import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import SkeletonCard from "@/components/common/SkeletonCard";
import {
  createSavingsProduct,
  deactivateSavingsProduct,
  fetchSavingsProducts,
  updateSavingsProduct,
} from "@/api/savingsProducts";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { formatKrw, formatKrwPreview } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { SavingsProductOut } from "@/types";

interface Draft {
  name: string;
  current_balance: string;
  monthly_saving_amount: string;
}

const EMPTY_DRAFT: Draft = { name: "", current_balance: "0", monthly_saving_amount: "0" };

function draftFromProduct(product: SavingsProductOut): Draft {
  return {
    name: product.name,
    current_balance: product.current_balance,
    monthly_saving_amount: product.monthly_saving_amount,
  };
}

export default function SavingsProductsSection() {
  const [formTarget, setFormTarget] = useState<"new" | SavingsProductOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.savingsProducts, queryFn: fetchSavingsProducts });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProducts });

  const createMutation = useMutation({
    mutationFn: createSavingsProduct,
    onSuccess: () => {
      void invalidate();
      setFormTarget(null);
      toast("저축/투자 상품을 추가했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Parameters<typeof updateSavingsProduct>[1]) =>
      updateSavingsProduct(id, payload),
    onSuccess: () => {
      void invalidate();
      setFormTarget(null);
      toast("저장했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateSavingsProduct,
    onSuccess: () => {
      void invalidate();
      setDeactivateTarget(null);
      toast("비활성화했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (isLoading || !data) {
    return <SkeletonCard rows={4} />;
  }

  const totalBalance = data.reduce((sum, p) => sum + Number(p.current_balance), 0);
  const totalMonthly = data.reduce((sum, p) => sum + Number(p.monthly_saving_amount), 0);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (draft: Draft) => {
    if (formTarget === "new") {
      createMutation.mutate(draft);
    } else if (formTarget) {
      updateMutation.mutate({ id: formTarget.id, ...draft });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new")}>
          상품 추가
        </Button>
      </div>

      {data.length === 0 ? (
        <EmptyState title="등록된 저축/투자 상품이 없어요" compact />
      ) : (
        <div className="space-y-2">
          {data.map((product) => (
            <div key={product.id} className="card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{product.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {formatKrw(product.current_balance)} · 월 {formatKrw(product.monthly_saving_amount)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setFormTarget(product)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
                  aria-label="수정"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeactivateTarget(product.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
                  aria-label="비활성화"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-6 pt-1 text-sm font-semibold text-gray-900 dark:text-gray-50">
            <span>현재 적립액 합계 {formatKrw(totalBalance)}</span>
            <span>월 저축액 합계 {formatKrw(totalMonthly)}</span>
          </div>
        </div>
      )}

      {formTarget && (
        <SavingsProductFormModal
          initial={formTarget === "new" ? EMPTY_DRAFT : draftFromProduct(formTarget)}
          title={formTarget === "new" ? "저축/투자 상품 추가" : "저축/투자 상품 수정"}
          submitLabel={formTarget === "new" ? "추가" : "저장"}
          submitting={isSaving}
          onClose={() => setFormTarget(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deactivateTarget !== null && (
        <ConfirmModal
          message="이 저축/투자 상품을 비활성화할까요?"
          onConfirm={() => deactivateMutation.mutate(deactivateTarget)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  );
}

function SavingsProductFormModal({
  initial,
  title,
  submitLabel,
  submitting,
  onClose,
  onSubmit,
}: {
  initial: Draft;
  title: string;
  submitLabel: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    onSubmit(draft);
  };

  return (
    <Modal onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
        <FormInput
          label="상품명"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full"
          required
        />
        <FormInput
          label="현재 적립된 금액"
          type="number"
          inputMode="decimal"
          value={draft.current_balance}
          onChange={(e) => setDraft((d) => ({ ...d, current_balance: e.target.value }))}
          className="w-full"
          preview={Number(draft.current_balance) > 0 ? formatKrwPreview(Number(draft.current_balance)) : undefined}
        />
        <FormInput
          label="월 저축액"
          type="number"
          inputMode="decimal"
          value={draft.monthly_saving_amount}
          onChange={(e) => setDraft((d) => ({ ...d, monthly_saving_amount: e.target.value }))}
          className="w-full"
          preview={
            Number(draft.monthly_saving_amount) > 0 ? formatKrwPreview(Number(draft.monthly_saving_amount)) : undefined
          }
        />
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
