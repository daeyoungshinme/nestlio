import { ExternalLink, ShieldCheck, TrendingUp } from "lucide-react";
import { GROWLIO_APP_URL, growlioPortfolioUrl, isGrowlioLinkedInvestment } from "@/constants/growlio";
import { formatKrw } from "@/utils/format";
import type { SavingsProductOut, SurplusAllocationOut } from "@/types";

interface Props {
  surplusAllocation: SurplusAllocationOut;
  investmentProducts: SavingsProductOut[];
}

/** 이번달 여유자금(coaching_engine.recommend_surplus_allocation)을 비상금 보충분과 투자
 * 가능분으로 나눠 보여준다 — 비상금이 부족한 상태에서도 여유자금 전부를 growlio 투자로
 * 유도하던 이전 동작을 개선한 것. */
export default function InvestSurplusCard({ surplusAllocation, investmentProducts }: Props) {
  if (!GROWLIO_APP_URL) return null;
  const emergencyFundPortion = Number(surplusAllocation.emergency_fund_portion);
  const investablePortion = Number(surplusAllocation.investable_portion);
  const targets = investmentProducts.filter(isGrowlioLinkedInvestment);
  const showInvestSection = investablePortion > 0 && targets.length > 0;
  if (emergencyFundPortion <= 0 && !showInvestSection) return null;

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="font-medium text-gray-700 dark:text-gray-300">
          이번 달 아직 저축·투자로 옮기지 않은 여유자금
        </span>
      </div>

      {emergencyFundPortion > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950 px-3 py-2">
          <ShieldCheck size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            비상금이 목표치보다 부족해요. {formatKrw(surplusAllocation.emergency_fund_portion)}은 비상금으로
            먼저 채워보세요.
          </p>
        </div>
      )}

      {showInvestSection && (
        <>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
            {formatKrw(surplusAllocation.investable_portion)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            지출을 통제해서 남긴 돈이에요. growlio 포트폴리오에 담아 굴려보세요.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {targets.map((product) => (
              <a
                key={product.id}
                href={growlioPortfolioUrl(product.growlio_account_id!)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
              >
                <ExternalLink size={12} />
                {product.name} 포트폴리오에 담기
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
