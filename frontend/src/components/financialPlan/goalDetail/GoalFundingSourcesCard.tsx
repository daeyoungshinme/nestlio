import { ExternalLink } from "lucide-react";
import { GROWLIO_APP_URL, findGrowlioInvestmentLink, growlioPortfolioUrl } from "@/constants/growlio";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { useSavingsProducts } from "@/hooks/useReferenceData";
import { formatKrw } from "@/utils/format";
import type { FinancialGoalOut } from "@/types";

/** 연동된 자금원 목록 + (growlio 투자 상품이 연동돼 있으면) growlio 포트폴리오 링크. */
export default function GoalFundingSourcesCard({ goal }: { goal: FinancialGoalOut }) {
  const { data: savingsProducts } = useSavingsProducts();
  const growlioAccountId = findGrowlioInvestmentLink(goal, savingsProducts ?? []);
  return (
    <div className="card space-y-2">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">연동된 자금원</h2>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {goal.funding_sources.map((fs) => (
          <div key={`${fs.type}-${fs.id}`} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="truncate text-gray-700 dark:text-gray-300">{fs.name}</span>
            <span className="shrink-0 text-gray-900 dark:text-gray-50">{formatKrw(fs.amount)}</span>
          </div>
        ))}
      </div>
      {growlioAccountId && GROWLIO_APP_URL && (
        <a
          href={growlioPortfolioUrl(growlioAccountId)}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 ${TOUCH_TARGET_MIN_HEIGHT} text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline`}
        >
          <ExternalLink size={14} aria-hidden="true" />
          growlio에서 이 목표의 포트폴리오 보기
        </a>
      )}
    </div>
  );
}
