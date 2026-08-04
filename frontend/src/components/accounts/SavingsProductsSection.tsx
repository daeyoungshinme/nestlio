import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus, RefreshCw, Unlink } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import RowActionButtons from "@/components/common/RowActionButtons";
import SkeletonCard from "@/components/common/SkeletonCard";
import {
  createSavingsProduct,
  deactivateSavingsProduct,
  fetchGrowlioAccounts,
  fetchSavingsProducts,
  setGrowlioLink,
  syncSavingsProduct,
  updateSavingsProduct,
} from "@/api/savingsProducts";
import { fetchGoals } from "@/api/goals";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { formatKrw, formatKrwPreview, toAmountInputValue } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import { savingsProductTypeBadgeStyle, savingsProductTypeLabel } from "@/utils/colors";
import type { SavingsProductOut, SavingsProductType } from "@/types";

function formatSyncedAt(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Draft {
  name: string;
  current_balance: string;
  monthly_saving_amount: string;
  product_type: SavingsProductType;
}

const EMPTY_DRAFT: Draft = { name: "", current_balance: "0", monthly_saving_amount: "0", product_type: "savings" };
const PRODUCT_TYPES: SavingsProductType[] = ["savings", "investment"];

function draftFromProduct(product: SavingsProductOut): Draft {
  return {
    name: product.name,
    current_balance: toAmountInputValue(product.current_balance),
    monthly_saving_amount: toAmountInputValue(product.monthly_saving_amount),
    product_type: product.product_type,
  };
}

export default function SavingsProductsSection() {
  const [formTarget, setFormTarget] = useState<"new" | SavingsProductOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.savingsProducts, queryFn: fetchSavingsProducts });
  const { data: goals } = useQuery({ queryKey: QUERY_KEYS.financialGoals, queryFn: fetchGoals });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProducts });

  const { createMutation, updateMutation, removeMutation: deactivateMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.savingsProducts],
    api: { create: createSavingsProduct, update: updateSavingsProduct, remove: deactivateSavingsProduct },
    messages: { create: "저축/투자 상품을 추가했습니다.", update: "저장했습니다.", remove: "비활성화했습니다." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });

  const syncMutation = useMutation({
    mutationFn: syncSavingsProduct,
    onSuccess: () => {
      void invalidate();
      toast("growlio 잔액을 동기화했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (isLoading || !data) {
    return <SkeletonCard rows={4} />;
  }

  const totalBalance = data.reduce((sum, p) => sum + Number(p.current_balance), 0);
  const totalMonthly = data.reduce((sum, p) => sum + Number(p.monthly_saving_amount), 0);
  const balanceByType = PRODUCT_TYPES.map((type) => ({
    type,
    total: data.filter((p) => p.product_type === type).reduce((sum, p) => sum + Number(p.current_balance), 0),
  })).filter((entry) => entry.total > 0);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (draft: Draft) => {
    if (formTarget === "new") {
      createMutation.mutate(draft);
    } else if (formTarget) {
      updateMutation.mutate({ id: formTarget.id, payload: draft });
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
          {data.map((product) => {
            const linkedGoal = goals?.find((g) => g.primary_savings_product_id === product.id);
            return (
            <div key={product.id} className="card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{product.name}</p>
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium ${savingsProductTypeBadgeStyle(product.product_type)}`}
                  >
                    {savingsProductTypeLabel(product.product_type)}
                  </span>
                  {product.growlio_account_id && (
                    <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      <Link2 size={11} />
                      growlio 연동
                    </span>
                  )}
                  {linkedGoal && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      목표: {linkedGoal.name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {formatKrw(product.current_balance)} · 월 {formatKrw(product.monthly_saving_amount)}
                </p>
                {product.growlio_account_id && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {product.last_synced_at ? `마지막 동기화 ${formatSyncedAt(product.last_synced_at)}` : "아직 동기화하지 않았어요"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {product.growlio_account_id && (
                  <button
                    onClick={() => syncMutation.mutate(product.id)}
                    disabled={syncMutation.isPending}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors disabled:opacity-50"
                    aria-label="growlio 동기화"
                  >
                    <RefreshCw size={16} className={syncMutation.isPending ? "animate-spin" : ""} />
                  </button>
                )}
                <RowActionButtons
                  onEdit={() => setFormTarget(product)}
                  onDelete={() => setDeactivateTarget(product.id)}
                  deleteLabel="비활성화"
                />
              </div>
            </div>
            );
          })}
          <div className="flex flex-col items-end gap-1 pt-1">
            <div className="flex justify-end gap-6 text-sm font-semibold text-gray-900 dark:text-gray-50">
              <span>현재 적립액 합계 {formatKrw(totalBalance)}</span>
              <span>월 저축액 합계 {formatKrw(totalMonthly)}</span>
            </div>
            {balanceByType.length > 1 && (
              <div className="flex justify-end gap-4 text-xs text-gray-500 dark:text-gray-400">
                {balanceByType.map(({ type, total }) => (
                  <span key={type}>
                    {savingsProductTypeLabel(type)} {formatKrw(total)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {formTarget && (
        <SavingsProductFormModal
          initial={formTarget === "new" ? EMPTY_DRAFT : draftFromProduct(formTarget)}
          product={formTarget === "new" ? null : formTarget}
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
  product,
  title,
  submitLabel,
  submitting,
  onClose,
  onSubmit,
}: {
  initial: Draft;
  product: SavingsProductOut | null;
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
        <div>
          <label className="block mb-1 font-medium text-sm text-gray-700 dark:text-gray-300">유형</label>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
            {PRODUCT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, product_type: type }))}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  draft.product_type === type
                    ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-50"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {savingsProductTypeLabel(type)}
              </button>
            ))}
          </div>
        </div>
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
        {product && <GrowlioLinkSection product={product} onLinked={onClose} />}
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}

function GrowlioLinkSection({ product, onLinked }: { product: SavingsProductOut; onLinked: () => void }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: growlioAccounts, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEYS.growlioAccounts,
    queryFn: fetchGrowlioAccounts,
    enabled: pickerOpen,
    retry: false,
  });

  const linkMutation = useMutation({
    mutationFn: (growlioAccountId: string | null) =>
      setGrowlioLink(product.id, { growlio_account_id: growlioAccountId, auto_sync_enabled: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProducts });
      toast("growlio 연동을 저장했습니다.", "success");
      // 이 모달의 product prop은 열렸을 때의 스냅샷이라 연동 상태 변경이 즉시 반영되지 않으므로
      // 모달을 닫아 목록의 최신 상태(뱃지/동기화 버튼)를 보여준다.
      onLinked();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mt-1">
      <label className="block mb-1.5 font-medium text-sm text-gray-700 dark:text-gray-300">growlio 계좌 연동</label>
      {product.growlio_account_id ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400 truncate">
            연동됨 ({product.growlio_account_id.slice(0, 8)}…)
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Unlink size={14} />}
            loading={linkMutation.isPending}
            onClick={() => linkMutation.mutate(null)}
          >
            연동 해제
          </Button>
        </div>
      ) : pickerOpen ? (
        <div className="space-y-2">
          {isLoading && <p className="text-xs text-gray-400">growlio 계좌를 불러오는 중…</p>}
          {isError && (
            <p className="text-xs text-red-500">{extractErrorMessage(error, "growlio 계좌를 불러오지 못했습니다.")}</p>
          )}
          {growlioAccounts && growlioAccounts.length === 0 && (
            <p className="text-xs text-gray-400">연동할 수 있는 growlio 계좌가 없어요.</p>
          )}
          {growlioAccounts?.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => linkMutation.mutate(account.id)}
              disabled={linkMutation.isPending}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors disabled:opacity-50"
            >
              <span className="truncate">{account.name}</span>
              <span className="shrink-0 text-gray-500 dark:text-gray-400">{formatKrw(account.current_value_krw)}</span>
            </button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>
            취소
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" icon={<Link2 size={14} />} onClick={() => setPickerOpen(true)}>
          growlio 계좌 선택
        </Button>
      )}
    </div>
  );
}
