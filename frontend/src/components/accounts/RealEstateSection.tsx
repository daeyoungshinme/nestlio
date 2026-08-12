import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Link2, Plus, RefreshCw } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import GrowlioSavingsImportModal from "@/components/accounts/GrowlioSavingsImportModal";
import Modal from "@/components/common/Modal";
import RowActionButtons from "@/components/common/RowActionButtons";
import SkeletonCard from "@/components/common/SkeletonCard";
import SummaryCard from "@/components/common/SummaryCard";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import {
  createSavingsProduct,
  deactivateSavingsProduct,
  fetchSavingsProducts,
  updateSavingsProduct,
} from "@/api/savingsProducts";
import { syncRealEstate } from "@/api/realEstate";
import { fetchGoals } from "@/api/goals";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { formatKrw, formatKrwPreview, formatPercent, formatSyncedAt, toAmountInputValue } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import { returnRateTextColor, savingsProductTypeBadgeStyle, savingsProductTypeLabel } from "@/utils/colors";
import type { FinancialGoalOut, SavingsProductOut, UserOut } from "@/types";

interface Draft {
  name: string;
  current_balance: string;
  principal_amount: string;
  owner_user_id: string;
}

const EMPTY_DRAFT: Draft = { name: "", current_balance: "0", principal_amount: "", owner_user_id: "" };

function draftFromProduct(product: SavingsProductOut): Draft {
  return {
    name: product.name,
    current_balance: toAmountInputValue(product.current_balance),
    principal_amount: product.principal_amount !== null ? toAmountInputValue(product.principal_amount) : "",
    owner_user_id: product.owner_user_id ?? "",
  };
}

function toRealEstatePayload(draft: Draft) {
  return {
    name: draft.name,
    current_balance: draft.current_balance,
    monthly_saving_amount: "0",
    product_type: "real_estate" as const,
    principal_amount: draft.principal_amount !== "" ? draft.principal_amount : null,
    owner_user_id: draft.owner_user_id || null,
  };
}

interface Props {
  users: UserOut[] | undefined;
}

export default function RealEstateSection({ users }: Props) {
  const [formTarget, setFormTarget] = useState<"new" | SavingsProductOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: allData, isLoading } = useQuery({ queryKey: QUERY_KEYS.savingsProducts, queryFn: fetchSavingsProducts });
  const { data: goals } = useQuery({ queryKey: QUERY_KEYS.financialGoals, queryFn: fetchGoals });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProducts });

  const { createMutation, updateMutation, removeMutation: deactivateMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.savingsProducts],
    api: { create: createSavingsProduct, update: updateSavingsProduct, remove: deactivateSavingsProduct },
    messages: { create: "부동산을 추가했습니다.", update: "저장했습니다.", remove: "비활성화했습니다." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });

  // 부동산은 시세뿐 아니라 짝이 되는 담보대출 잔액도 함께 갱신되므로(app/services/real_estate_service.py),
  // 동기화 성공 시 저축/투자 쿼리뿐 아니라 대출 쿼리도 함께 무효화한다.
  const syncMutation = useMutation({
    mutationFn: syncRealEstate,
    onSuccess: () => {
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loans });
      toast("growlio 시세/담보대출을 동기화했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (isLoading || !allData) {
    return <SkeletonCard rows={4} />;
  }

  const data = allData.filter((p) => p.product_type === "real_estate");

  const existingGrowlioAccountIds = new Set(
    data.filter((p): p is SavingsProductOut & { growlio_account_id: string } => !!p.growlio_account_id).map((p) => p.growlio_account_id)
  );
  const rowsWithGain = data.filter((p) => p.return_amount !== null);
  const totalGain = rowsWithGain.reduce((sum, p) => sum + Number(p.return_amount), 0);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const goalsFor = (product: SavingsProductOut) =>
    goals?.filter((g) => g.funding_sources.some((fs) => fs.type === "savings_product" && fs.id === product.id)) ?? [];

  const handleSubmit = (draft: Draft) => {
    const payload = toRealEstatePayload(draft);
    if (formTarget === "new") {
      createMutation.mutate(payload);
    } else if (formTarget) {
      updateMutation.mutate({ id: formTarget.id, payload });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 flex-wrap">
        <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={() => setImportOpen(true)}>
          growlio에서 가져오기
        </Button>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new")}>
          부동산 추가
        </Button>
      </div>

      {data.length === 0 ? (
        <EmptyState title="등록된 부동산이 없어요" compact />
      ) : (
        <div className="space-y-4">
          {rowsWithGain.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard
                label="평가손익 합계"
                value={formatKrw(totalGain)}
                tone={totalGain >= 0 ? "positive" : "negative"}
              />
            </div>
          )}

          <div className="space-y-2">
            {data.map((product) => (
              <RealEstateRow
                key={product.id}
                product={product}
                users={users}
                linkedGoals={goalsFor(product)}
                syncPending={syncMutation.isPending}
                onSync={() => syncMutation.mutate(product.id)}
                onEdit={() => setFormTarget(product)}
                onDelete={() => setDeactivateTarget(product.id)}
              />
            ))}
          </div>
        </div>
      )}

      {formTarget && (
        <RealEstateFormModal
          initial={formTarget === "new" ? EMPTY_DRAFT : draftFromProduct(formTarget)}
          title={formTarget === "new" ? "부동산 추가" : "부동산 수정"}
          submitLabel={formTarget === "new" ? "추가" : "저장"}
          submitting={isSaving}
          users={users}
          onClose={() => setFormTarget(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deactivateTarget !== null && (
        <ConfirmModal
          message="이 부동산을 비활성화할까요?"
          onConfirm={() => deactivateMutation.mutate(deactivateTarget)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}

      {importOpen && (
        <GrowlioSavingsImportModal
          kind="real_estate"
          existingGrowlioAccountIds={existingGrowlioAccountIds}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

function RealEstateRow({
  product,
  users,
  linkedGoals,
  syncPending,
  onSync,
  onEdit,
  onDelete,
}: {
  product: SavingsProductOut;
  users: UserOut[] | undefined;
  linkedGoals: FinancialGoalOut[];
  syncPending: boolean;
  onSync: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ownerLabel = product.owner_user_id
    ? (users?.find((u) => u.id === product.owner_user_id)?.display_name ?? "공통")
    : "공통";
  return (
    <div className="card flex items-center justify-between gap-3">
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
          {linkedGoals.length > 0 && (
            <span
              className="shrink-0 max-w-[140px] sm:max-w-[220px] truncate px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              title={`목표: ${linkedGoals.map((g) => g.name).join(", ")}`}
            >
              목표: {linkedGoals[0].name}
              {linkedGoals.length > 1 && ` 외 ${linkedGoals.length - 1}건`}
            </span>
          )}
          {product.return_rate_pct !== null && (
            <span className={`shrink-0 text-[11px] font-semibold ${returnRateTextColor(Number(product.return_rate_pct))}`}>
              {Number(product.return_rate_pct) > 0 ? "+" : ""}
              {formatPercent(Number(product.return_rate_pct), 1)}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {ownerLabel}
          {product.return_amount !== null && (
            <span className={returnRateTextColor(Number(product.return_rate_pct))}>
              {" "}
              · 매입가 {formatKrw(product.principal_amount)} ({Number(product.return_amount) > 0 ? "+" : ""}
              {formatKrw(product.return_amount)})
            </span>
          )}
        </p>
        <p className="mt-1 text-base font-bold text-gray-900 dark:text-gray-50">{formatKrw(product.current_balance)}</p>
        {product.growlio_account_id && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            {product.last_synced_at ? `마지막 동기화 ${formatSyncedAt(product.last_synced_at)}` : "아직 동기화하지 않았어요"}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {product.growlio_account_id && (
          <button
            onClick={onSync}
            disabled={syncPending}
            className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors disabled:opacity-50`}
            aria-label="growlio 시세/담보대출 동기화"
            title="시세/담보대출 동기화"
          >
            <RefreshCw size={16} className={syncPending ? "animate-spin" : ""} />
          </button>
        )}
        <RowActionButtons onEdit={onEdit} onDelete={onDelete} deleteLabel="비활성화" />
      </div>
    </div>
  );
}

function RealEstateFormModal({
  initial,
  title,
  submitLabel,
  submitting,
  users,
  onClose,
  onSubmit,
}: {
  initial: Draft;
  title: string;
  submitLabel: string;
  submitting: boolean;
  users: UserOut[] | undefined;
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
          label="이름"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full"
          required
        />
        <FormInput
          label="현재 시세"
          type="number"
          inputMode="decimal"
          value={draft.current_balance}
          onChange={(e) => setDraft((d) => ({ ...d, current_balance: e.target.value }))}
          className="w-full"
          preview={Number(draft.current_balance) > 0 ? formatKrwPreview(Number(draft.current_balance)) : undefined}
        />
        <FormInput
          label="매입가 (선택)"
          type="number"
          inputMode="decimal"
          value={draft.principal_amount}
          onChange={(e) => setDraft((d) => ({ ...d, principal_amount: e.target.value }))}
          className="w-full"
          preview={Number(draft.principal_amount) > 0 ? formatKrwPreview(Number(draft.principal_amount)) : undefined}
        />
        <div>
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>소유자</label>
          <select
            className={`${INPUT_SM} w-full`}
            value={draft.owner_user_id}
            onChange={(e) => setDraft((d) => ({ ...d, owner_user_id: e.target.value }))}
          >
            <option value="">공통</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
