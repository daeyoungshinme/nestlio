import { useNavigate } from "react-router-dom";
import { Link2 } from "lucide-react";
import AssetRow from "@/components/accounts/AssetRow";
import AssetSectionShell from "@/components/accounts/AssetSectionShell";
import LoanFormModal, {
  draftFromLoan,
  EMPTY_LOAN_DRAFT,
  REPAYMENT_METHOD_LABEL,
  toLoanPayload,
  type LoanDraft,
} from "@/components/accounts/LoanFormModal";
import QueryBoundary from "@/components/common/QueryBoundary";
import InlineStatsBar from "@/components/common/InlineStatsBar";
import { createLoan, deactivateLoan, updateLoan } from "@/api/loans";
import { useAssetSection } from "@/hooks/useAssetSection";
import { useLoans } from "@/hooks/useReferenceData";
import { accountsSectionLink } from "@/constants/routes";
import { formatKrw, resolveOwnerLabel } from "@/utils/format";
import type { LoanCreateIn, LoanOut, LoanUpdateIn, UserOut } from "@/types";
import { sumAmounts } from "@/utils/amount";

interface Props {
  users: UserOut[] | undefined;
}

/** 자산 › 대출. growlio에서 따로 가져오지 않고(담보대출은 부동산 가져오기·동기화가 함께 만든다) 행 단위 동기화도
 * 없어서 공용 골격(useAssetSection + AssetSectionShell)에서 가져오기·동기화만 뺀다. */
export default function LoansSection({ users }: Props) {
  const loansQuery = useLoans();
  const section = useAssetSection<LoanOut, LoanCreateIn, LoanUpdateIn>({
    api: { create: createLoan, update: updateLoan, deactivate: deactivateLoan },
    getId: (loan) => loan.id,
    messages: { create: "대출을 추가했습니다." },
  });

  const handleSubmit = (draft: LoanDraft) => {
    const payload = toLoanPayload(draft);
    section.submit(payload, payload);
  };

  return (
    <QueryBoundary query={loansQuery} errorMessage="대출을 불러오지 못했어요">
      {(data) => (
        <AssetSectionShell
          addLabel="대출 추가"
          onAdd={section.openNew}
          isEmpty={data.length === 0}
          emptyTitle="등록된 대출이 없어요"
          deactivateMessage="이 대출을 비활성화할까요?"
          deactivateOpen={section.deactivateTarget !== null}
          onConfirmDeactivate={section.confirmDeactivate}
          deactivating={section.deactivating}
          onCancelDeactivate={section.cancelDeactivate}
          overlays={
            section.formTarget && (
              <LoanFormModal
                initial={section.editing ? draftFromLoan(section.editing) : EMPTY_LOAN_DRAFT}
                title={section.isNew ? "대출 추가" : "대출 수정"}
                submitLabel={section.isNew ? "추가" : "저장"}
                submitting={section.isSaving}
                users={users}
                onClose={section.closeForm}
                onSubmit={handleSubmit}
              />
            )
          }
        >
          <div className="space-y-4">
            <InlineStatsBar
              items={[
                { label: "월납입금액 합계", value: formatKrw(sumAmounts(data, (l) => l.monthly_payment)), tone: "negative" },
              ]}
            />
            <div className="space-y-2">
              {data.map((loan) => (
                <LoanRow
                  key={loan.id}
                  loan={loan}
                  users={users}
                  onEdit={() => section.openEdit(loan)}
                  onDelete={() => section.askDeactivate(loan)}
                />
              ))}
            </div>
          </div>
        </AssetSectionShell>
      )}
    </QueryBoundary>
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
  const navigate = useNavigate();

  return (
    <AssetRow
      name={loan.name}
      linked={!!loan.growlio_account_id}
      meta={
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {loan.repayment_method ? `${REPAYMENT_METHOD_LABEL[loan.repayment_method]} · ` : ""}
          {resolveOwnerLabel(loan.owner_user_id, users)}
        </p>
      }
      amount={
        <>
          <p className="mt-1 text-base font-bold text-gray-900 dark:text-gray-50">{formatKrw(loan.balance)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">월 {formatKrw(loan.monthly_payment)}</p>
        </>
      }
      lastSyncedAt={loan.last_synced_at}
      // 담보대출은 짝 부동산 동기화가 함께 갱신한다 — 행에서는 부동산 섹션으로 보낸다.
      actions={
        loan.growlio_account_id
          ? [{ icon: <Link2 size={16} />, label: "부동산에서 동기화", onClick: () => navigate(accountsSectionLink("부동산")) }]
          : []
      }
      onEdit={onEdit}
      onDelete={onDelete}
      deleteLabel="비활성화"
      menuAriaLabel={`${loan.name} 작업 더 보기`}
    />
  );
}
