import { ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import AssetRow from "@/components/accounts/AssetRow";
import { ProductBadges, ReturnAmountText } from "@/components/accounts/productRowParts";
import { GROWLIO_APP_URL, growlioPortfolioUrl, isGrowlioLinkedInvestment } from "@/constants/growlio";
import { planViewLink } from "@/constants/routes";
import { formatKrw, resolveOwnerLabel } from "@/utils/format";
import type { FinancialGoalOut, SavingsProductOut, UserOut } from "@/types";

interface Props {
  product: SavingsProductOut;
  /** 이번 달 계획액 — 계획을 불러오기 전이면 null(표시 안 함). */
  monthlyPlan: string | null;
  users: UserOut[] | undefined;
  linkedGoals: FinancialGoalOut[];
  syncPending: boolean;
  onSync: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** 자산 › 저축·투자 한 행 — 유형·목표 배지, 이번 달 계획, 원금·평가손익, growlio 동기화·포트폴리오 링크. */
export default function SavingsProductRow({
  product,
  monthlyPlan,
  users,
  linkedGoals,
  syncPending,
  onSync,
  onEdit,
  onDelete,
}: Props) {
  const showsExternalLink = isGrowlioLinkedInvestment(product) && !!GROWLIO_APP_URL;

  return (
    <AssetRow
      name={product.name}
      linked={!!product.growlio_account_id}
      meta={
        <>
          <ProductBadges product={product} linkedGoals={linkedGoals} />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {resolveOwnerLabel(product.owner_user_id, users)}
            {monthlyPlan !== null && ` · 월 ${formatKrw(monthlyPlan)}`}
            <ReturnAmountText product={product} label="원금" />
          </p>
          {(product.product_type === "savings" || product.product_type === "investment") && (
            <Link
              to={planViewLink("이번 달")}
              className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-primary-400 mt-1"
            >
              월별 계획 보기 <ArrowRight size={12} />
            </Link>
          )}
        </>
      }
      amount={<p className="mt-1 text-base font-bold text-gray-900 dark:text-gray-50">{formatKrw(product.current_balance)}</p>}
      lastSyncedAt={product.last_synced_at}
      sync={{ onSync, pending: syncPending }}
      actions={
        showsExternalLink
          ? [
              {
                icon: <ExternalLink size={16} />,
                label: "growlio에서 포트폴리오 보기",
                href: growlioPortfolioUrl(product.growlio_account_id as string),
              },
            ]
          : []
      }
      onEdit={onEdit}
      onDelete={onDelete}
      deleteLabel="비활성화"
      menuAriaLabel={`${product.name} 작업 더 보기`}
    />
  );
}
