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
import { createLoan, deactivateLoan, fetchLoans, updateLoan } from "@/api/loans";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { formatKrw, formatKrwPreview } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { LoanOut, RepaymentMethod } from "@/types";

const REPAYMENT_METHOD_LABEL: Record<RepaymentMethod, string> = {
  equal_payment: "원리금균등",
  equal_principal: "원금균등",
  bullet: "만기일시상환",
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
}

const EMPTY_DRAFT: Draft = {
  name: "",
  balance: "0",
  monthly_payment: "0",
  origination_year_month: "",
  term_months: "",
  interest_rate: "",
  repayment_method: "",
};

function draftFromLoan(loan: LoanOut): Draft {
  return {
    name: loan.name,
    balance: loan.balance,
    monthly_payment: loan.monthly_payment,
    origination_year_month: loan.origination_year_month ?? "",
    term_months: loan.term_months !== null ? String(loan.term_months) : "",
    interest_rate: loan.interest_rate ?? "",
    repayment_method: loan.repayment_method ?? "",
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
  };
}

export default function LoansSection() {
  const [formTarget, setFormTarget] = useState<"new" | LoanOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.loans, queryFn: fetchLoans });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loans });

  const createMutation = useMutation({
    mutationFn: createLoan,
    onSuccess: () => {
      void invalidate();
      setFormTarget(null);
      toast("대출을 추가했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Parameters<typeof updateLoan>[1]) => updateLoan(id, payload),
    onSuccess: () => {
      void invalidate();
      setFormTarget(null);
      toast("저장했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateLoan,
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

  const totalBalance = data.reduce((sum, l) => sum + Number(l.balance), 0);
  const totalMonthly = data.reduce((sum, l) => sum + Number(l.monthly_payment), 0);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (draft: Draft) => {
    if (formTarget === "new") {
      createMutation.mutate(toPayload(draft));
    } else if (formTarget) {
      updateMutation.mutate({ id: formTarget.id, ...toPayload(draft) });
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
        <div className="space-y-2">
          {data.map((loan) => (
            <div key={loan.id} className="card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate">{loan.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  잔액 {formatKrw(loan.balance)} · 월 {formatKrw(loan.monthly_payment)}
                  {loan.repayment_method ? ` · ${REPAYMENT_METHOD_LABEL[loan.repayment_method]}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setFormTarget(loan)}
                  className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors"
                  aria-label="수정"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => setDeactivateTarget(loan.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 rounded-lg transition-colors"
                  aria-label="비활성화"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-6 pt-1 text-sm font-semibold text-gray-900 dark:text-gray-50">
            <span>대출잔액 합계 {formatKrw(totalBalance)}</span>
            <span>월납입금액 합계 {formatKrw(totalMonthly)}</span>
          </div>
        </div>
      )}

      {formTarget && (
        <LoanFormModal
          initial={formTarget === "new" ? EMPTY_DRAFT : draftFromLoan(formTarget)}
          title={formTarget === "new" ? "대출 추가" : "대출 수정"}
          submitLabel={formTarget === "new" ? "추가" : "저장"}
          submitting={isSaving}
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

function LoanFormModal({
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
            placeholder="YYYY-MM"
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
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
