import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Link2, Pencil, Plus, RefreshCw, Trash2, Unlink } from "lucide-react";
import Button from "@/components/common/Button";
import AccountActionsMenu from "@/components/common/AccountActionsMenu";
import type { AccountActionsMenuItem } from "@/components/common/AccountActionsMenu";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import GrowlioSavingsImportModal from "@/components/accounts/GrowlioSavingsImportModal";
import RowActionButtons from "@/components/common/RowActionButtons";
import SkeletonCard from "@/components/common/SkeletonCard";
import InlineStatsBar from "@/components/common/InlineStatsBar";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
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
import { formatKrw, formatKrwPreview, formatPercent, formatSyncedAt, toAmountInputValue } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import {
  growlioLinkedBadgeStyle,
  linkedGoalBadgeStyle,
  returnRateTextColor,
  savingsProductTypeBadgeStyle,
  savingsProductTypeDotClass,
  savingsProductTypeLabel,
} from "@/utils/colors";
import { GROWLIO_APP_URL, growlioPortfolioUrl, isGrowlioLinkedInvestment } from "@/constants/growlio";
import type { FinancialGoalOut, SavingsProductOut, SavingsProductType, UserOut } from "@/types";

interface Draft {
  name: string;
  current_balance: string;
  monthly_saving_amount: string;
  product_type: SavingsProductType;
  principal_amount: string;
  owner_user_id: string;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  current_balance: "0",
  monthly_saving_amount: "0",
  product_type: "savings",
  principal_amount: "",
  owner_user_id: "",
};
const PRODUCT_TYPES: SavingsProductType[] = ["savings", "investment", "emergency_fund"];

/** 항목이 적을 때 유형별로 접어두면 오히려 한눈에 보기 어려워지므로, 이 개수 이상일 때만 그룹핑한다. */
const GROUP_THRESHOLD = 5;

function draftFromProduct(product: SavingsProductOut): Draft {
  return {
    name: product.name,
    current_balance: toAmountInputValue(product.current_balance),
    monthly_saving_amount: toAmountInputValue(product.monthly_saving_amount),
    product_type: product.product_type,
    principal_amount: product.principal_amount !== null ? toAmountInputValue(product.principal_amount) : "",
    owner_user_id: product.owner_user_id ?? "",
  };
}

function toSavingsProductPayload(draft: Draft) {
  return {
    name: draft.name,
    current_balance: draft.current_balance,
    monthly_saving_amount: draft.monthly_saving_amount,
    product_type: draft.product_type,
    principal_amount:
      draft.product_type !== "savings" && draft.principal_amount !== "" ? draft.principal_amount : null,
    owner_user_id: draft.owner_user_id || null,
  };
}

interface Props {
  users: UserOut[] | undefined;
}

export default function SavingsProductsSection({ users }: Props) {
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

  if (isLoading || !allData) {
    return <SkeletonCard rows={4} />;
  }

  // 부동산(product_type: "real_estate")은 별도 "부동산" 탭(RealEstateSection)에서 다루므로 여기서는 제외한다.
  const data = allData.filter((p) => p.product_type !== "real_estate");

  const existingGrowlioAccountIds = new Set(
    data.filter((p): p is SavingsProductOut & { growlio_account_id: string } => !!p.growlio_account_id).map((p) => p.growlio_account_id)
  );
  const totalMonthly = data.reduce((sum, p) => sum + Number(p.monthly_saving_amount), 0);
  const balanceByType = PRODUCT_TYPES.map((type) => ({
    type,
    rows: data.filter((p) => p.product_type === type),
    total: data.filter((p) => p.product_type === type).reduce((sum, p) => sum + Number(p.current_balance), 0),
  })).filter((entry) => entry.rows.length > 0);
  const shouldGroup = data.length >= GROUP_THRESHOLD;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const goalsFor = (product: SavingsProductOut) =>
    goals?.filter((g) => g.funding_sources.some((fs) => fs.type === "savings_product" && fs.id === product.id)) ?? [];

  const renderRow = (product: SavingsProductOut) => (
    <SavingsProductRow
      key={product.id}
      product={product}
      users={users}
      linkedGoals={goalsFor(product)}
      syncPending={syncMutation.isPending}
      onSync={() => syncMutation.mutate(product.id)}
      onEdit={() => setFormTarget(product)}
      onDelete={() => setDeactivateTarget(product.id)}
    />
  );

  const handleSubmit = (draft: Draft) => {
    const payload = toSavingsProductPayload(draft);
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
          상품 추가
        </Button>
      </div>

      {data.length === 0 ? (
        <EmptyState title="등록된 저축/투자 상품이 없어요" compact />
      ) : (
        <div className="space-y-4">
          <InlineStatsBar
            items={[
              { label: "월 저축액 합계", value: formatKrw(totalMonthly) },
              ...(balanceByType.length > 1
                ? balanceByType.map(({ type, total }) => ({
                    label: savingsProductTypeLabel(type),
                    value: formatKrw(total),
                  }))
                : []),
            ]}
          />

          {shouldGroup ? (
            <div className="space-y-4">
              {balanceByType.map(({ type, rows, total }) => (
                <CollapsibleGroup
                  key={type}
                  header={
                    <>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${savingsProductTypeDotClass(type)}`} />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {savingsProductTypeLabel(type)} ({rows.length})
                      </span>
                    </>
                  }
                  amount={formatKrw(total)}
                  defaultOpen
                >
                  {rows.map(renderRow)}
                </CollapsibleGroup>
              ))}
            </div>
          ) : (
            <div className="space-y-2">{data.map(renderRow)}</div>
          )}
        </div>
      )}

      {formTarget && (
        <SavingsProductFormModal
          initial={formTarget === "new" ? EMPTY_DRAFT : draftFromProduct(formTarget)}
          product={formTarget === "new" ? null : formTarget}
          title={formTarget === "new" ? "저축/투자 상품 추가" : "저축/투자 상품 수정"}
          submitLabel={formTarget === "new" ? "추가" : "저장"}
          submitting={isSaving}
          users={users}
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

      {importOpen && (
        <GrowlioSavingsImportModal
          kind="investment"
          existingGrowlioAccountIds={existingGrowlioAccountIds}
          onClose={() => setImportOpen(false)}
        />
      )}
    </div>
  );
}

function SavingsProductRow({
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
  const showsExternalLink = isGrowlioLinkedInvestment(product) && !!GROWLIO_APP_URL;

  const menuItems: AccountActionsMenuItem[] = [];
  if (product.growlio_account_id) {
    menuItems.push({
      icon: <RefreshCw size={16} className={syncPending ? "animate-spin" : ""} />,
      label: syncPending ? "동기화 중…" : "growlio 동기화",
      onClick: onSync,
      disabled: syncPending,
    });
  }
  if (showsExternalLink) {
    menuItems.push({
      icon: <ExternalLink size={16} />,
      label: "growlio에서 포트폴리오 보기",
      href: growlioPortfolioUrl(product.growlio_account_id as string),
    });
  }
  menuItems.push({ icon: <Pencil size={16} />, label: "수정", onClick: onEdit });
  menuItems.push({ icon: <Trash2 size={16} />, label: "비활성화", onClick: onDelete, variant: "danger" });

  return (
    <div className="card p-4 sm:p-5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate flex-1 min-w-0">{product.name}</p>
          {product.growlio_account_id && (
            <span className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium ${growlioLinkedBadgeStyle()}`}>
              <Link2 size={11} />
              growlio 연동
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          <span
            className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium ${savingsProductTypeBadgeStyle(product.product_type)}`}
          >
            {savingsProductTypeLabel(product.product_type)}
          </span>
          {linkedGoals.length > 0 && (
            <span
              className={`shrink-0 max-w-[140px] sm:max-w-[220px] truncate px-1.5 py-0.5 rounded text-[11px] font-medium ${linkedGoalBadgeStyle()}`}
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
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {ownerLabel}
          {` · 월 ${formatKrw(product.monthly_saving_amount)}`}
          {product.return_amount !== null && (
            <span className={returnRateTextColor(Number(product.return_rate_pct))}>
              {" "}
              · 원금 {formatKrw(product.principal_amount)} ({Number(product.return_amount) > 0 ? "+" : ""}
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
        <div className="hidden sm:flex items-center gap-1">
          {product.growlio_account_id && (
            <button
              onClick={onSync}
              disabled={syncPending}
              className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors disabled:opacity-50`}
              aria-label="growlio 동기화"
            >
              <RefreshCw size={16} className={syncPending ? "animate-spin" : ""} />
            </button>
          )}
          {showsExternalLink && (
            <a
              href={growlioPortfolioUrl(product.growlio_account_id as string)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-lg transition-colors`}
              aria-label="growlio에서 포트폴리오 보기"
              title="growlio에서 포트폴리오 보기"
            >
              <ExternalLink size={16} />
            </a>
          )}
          <RowActionButtons onEdit={onEdit} onDelete={onDelete} deleteLabel="비활성화" />
        </div>
        <div className="sm:hidden">
          <AccountActionsMenu items={menuItems} ariaLabel={`${product.name} 작업 더 보기`} />
        </div>
      </div>
    </div>
  );
}

function SavingsProductFormModal({
  initial,
  product,
  title,
  submitLabel,
  submitting,
  users,
  onClose,
  onSubmit,
}: {
  initial: Draft;
  product: SavingsProductOut | null;
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
        {draft.product_type === "investment" && (
          <FormInput
            label="투자 원금 (선택)"
            type="number"
            inputMode="decimal"
            value={draft.principal_amount}
            onChange={(e) => setDraft((d) => ({ ...d, principal_amount: e.target.value }))}
            className="w-full"
            preview={Number(draft.principal_amount) > 0 ? formatKrwPreview(Number(draft.principal_amount)) : undefined}
          />
        )}
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
    queryKey: QUERY_KEYS.growlioInvestmentAccounts,
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

