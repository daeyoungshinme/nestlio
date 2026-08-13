import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Pencil, Plus, Trash2 } from "lucide-react";
import Button from "@/components/common/Button";
import AccountActionsMenu from "@/components/common/AccountActionsMenu";
import type { AccountActionsMenuItem } from "@/components/common/AccountActionsMenu";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import RowActionButtons from "@/components/common/RowActionButtons";
import SkeletonCard from "@/components/common/SkeletonCard";
import InlineStatsBar from "@/components/common/InlineStatsBar";
import { createLoan, deactivateLoan, fetchLoans, updateLoan } from "@/api/loans";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { formatKrw, formatKrwPreview, formatSyncedAt, toAmountInputValue } from "@/utils/format";
import { growlioLinkedBadgeStyle } from "@/utils/colors";
import type { LoanOut, RepaymentMethod, UserOut } from "@/types";

const REPAYMENT_METHOD_LABEL: Record<RepaymentMethod, string> = {
  equal_payment: "원리금균등",
  equal_principal: "원금균등",
  bullet: "만기일시상환",
  grace_period: "거치식",
  other: "기타",
};

interface Draft {
  name: string;
  balance: string;
  monthly_payment: string;
  origination_year_month: string;
  term_months: string;
  interest_rate: string;
  repayment_method: RepaymentMethod | "";
  owner_user_id: string;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  balance: "0",
  monthly_payment: "0",
  origination_year_month: "",
  term_months: "",
  interest_rate: "",
  repayment_method: "",
  owner_user_id: "",
};

function draftFromLoan(loan: LoanOut): Draft {
  return {
    name: loan.name,
    balance: toAmountInputValue(loan.balance),
    monthly_payment: toAmountInputValue(loan.monthly_payment),
    origination_year_month: loan.origination_year_month ?? "",
    term_months: loan.term_months !== null ? String(loan.term_months) : "",
    interest_rate: loan.interest_rate ?? "",
    repayment_method: loan.repayment_method ?? "",
    owner_user_id: loan.owner_user_id ?? "",
  };
}

function toPayload(draft: Draft) {
  return {
    name: draft.name,
    balance: draft.balance,
    monthly_payment: draft.monthly_payment,
    origination_year_month: draft.origination_year_month || null,
    term_months: draft.term_months === "" ? null : Number(draft.term_months),
    interest_rate: draft.interest_rate === "" ? null : draft.interest_rate,
    repayment_method: draft.repayment_method || null,
    owner_user_id: draft.owner_user_id || null,
  };
}

interface Props {
  users: UserOut[] | undefined;
}

export default function LoansSection({ users }: Props) {
  const [formTarget, setFormTarget] = useState<"new" | LoanOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<number | null>(null);

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.loans, queryFn: fetchLoans });

  const { createMutation, updateMutation, removeMutation: deactivateMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.loans],
    api: { create: createLoan, update: updateLoan, remove: deactivateLoan },
    messages: { create: "대출을 추가했습니다.", update: "저장했습니다.", remove: "비활성화했습니다." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });

  if (isLoading || !data) {
    return <SkeletonCard rows={4} />;
  }

  const totalMonthly = data.reduce((sum, l) => sum + Number(l.monthly_payment), 0);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (draft: Draft) => {
    if (formTarget === "new") {
      createMutation.mutate(toPayload(draft));
    } else if (formTarget) {
      updateMutation.mutate({ id: formTarget.id, payload: toPayload(draft) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new")}>
          대출 추가
        </Button>
      </div>

      {data.length === 0 ? (
        <EmptyState title="등록된 대출이 없어요" compact />
      ) : (
        <div className="space-y-4">
          <InlineStatsBar items={[{ label: "월납입금액 합계", value: formatKrw(totalMonthly), tone: "negative" }]} />
          <div className="space-y-2">
            {data.map((loan) => (
              <LoanRow
                key={loan.id}
                loan={loan}
                users={users}
                onEdit={() => setFormTarget(loan)}
                onDelete={() => setDeactivateTarget(loan.id)}
              />
            ))}
          </div>
        </div>
      )}

      {formTarget && (
        <LoanFormModal
          initial={formTarget === "new" ? EMPTY_DRAFT : draftFromLoan(formTarget)}
          title={formTarget === "new" ? "대출 추가" : "대출 수정"}
          submitLabel={formTarget === "new" ? "추가" : "저장"}
          submitting={isSaving}
          users={users}
          onClose={() => setFormTarget(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deactivateTarget !== null && (
        <ConfirmModal
          message="이 대출을 비활성화할까요?"
          onConfirm={() => deactivateMutation.mutate(deactivateTarget)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  );
}

function LoanRow({
  loan,
  users,
  onEdit,
  onDelete,
}: {
  loan: LoanOut;
  users: UserOut[] | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const ownerLabel = loan.owner_user_id
    ? (users?.find((u) => u.id === loan.owner_user_id)?.display_name ?? "공통")
    : "공통";

  const menuItems: AccountActionsMenuItem[] = [
    { icon: <Pencil size={16} />, label: "수정", onClick: onEdit },
    { icon: <Trash2 size={16} />, label: "비활성화", onClick: onDelete, variant: "danger" },
  ];

  return (
    <div className="card p-4 sm:p-5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{loan.name}</p>
          {loan.growlio_account_id && (
            <span className={`shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium ${growlioLinkedBadgeStyle()}`}>
              <Link2 size={11} />
              growlio 연동
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {loan.repayment_method ? `${REPAYMENT_METHOD_LABEL[loan.repayment_method]} · ` : ""}
          {ownerLabel}
        </p>
        <p className="mt-1 text-base font-bold text-gray-900 dark:text-gray-50">{formatKrw(loan.balance)}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">월 {formatKrw(loan.monthly_payment)}</p>
        {loan.growlio_account_id && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            {loan.last_synced_at
              ? `마지막 동기화 ${formatSyncedAt(loan.last_synced_at)} · 부동산 탭에서 동기화돼요`
              : "부동산 탭의 연동된 항목에서 동기화돼요"}
          </p>
        )}
      </div>
      <div className="hidden sm:flex">
        <RowActionButtons onEdit={onEdit} onDelete={onDelete} deleteLabel="비활성화" />
      </div>
      <div className="sm:hidden">
        <AccountActionsMenu items={menuItems} ariaLabel={`${loan.name} 작업 더 보기`} />
      </div>
    </div>
  );
}

function LoanFormModal({
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
          label="상품명"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className="w-full"
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            label="대출잔액"
            type="number"
            inputMode="decimal"
            value={draft.balance}
            onChange={(e) => setDraft((d) => ({ ...d, balance: e.target.value }))}
            className="w-full"
            preview={Number(draft.balance) > 0 ? formatKrwPreview(Number(draft.balance)) : undefined}
          />
          <FormInput
            label="월납입금액"
            type="number"
            inputMode="decimal"
            value={draft.monthly_payment}
            onChange={(e) => setDraft((d) => ({ ...d, monthly_payment: e.target.value }))}
            className="w-full"
            preview={Number(draft.monthly_payment) > 0 ? formatKrwPreview(Number(draft.monthly_payment)) : undefined}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            label="대출연월"
            type="month"
            value={draft.origination_year_month}
            onChange={(e) => setDraft((d) => ({ ...d, origination_year_month: e.target.value }))}
            className="w-full"
          />
          <FormInput
            label="대출기간(개월)"
            type="number"
            value={draft.term_months}
            onChange={(e) => setDraft((d) => ({ ...d, term_months: e.target.value }))}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            label="이자율(%)"
            type="number"
            inputMode="decimal"
            value={draft.interest_rate}
            onChange={(e) => setDraft((d) => ({ ...d, interest_rate: e.target.value }))}
            className="w-full"
          />
          <div>
            <label className={`block mb-1 font-medium ${LABEL_SM}`}>상환방식</label>
            <select
              className={`${INPUT_SM} w-full`}
              value={draft.repayment_method}
              onChange={(e) => setDraft((d) => ({ ...d, repayment_method: e.target.value as RepaymentMethod | "" }))}
            >
              <option value="">선택 안함</option>
              {Object.entries(REPAYMENT_METHOD_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
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
