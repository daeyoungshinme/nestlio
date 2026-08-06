import { ExternalLink, TrendingUp } from "lucide-react";
import { GROWLIO_APP_URL, growlioPortfolioUrl, isGrowlioLinkedInvestment } from "@/constants/growlio";
import { formatKrw } from "@/utils/format";
import type { SavingsProductOut } from "@/types";

interface Props {
  investableSurplus: string;
  investmentProducts: SavingsProductOut[];
}

export default function InvestSurplusCard({ investableSurplus, investmentProducts }: Props) {
  if (!GROWLIO_APP_URL || Number(investableSurplus) <= 0) return null;
  const targets = investmentProducts.filter(isGrowlioLinkedInvestment);
  if (targets.length === 0) return null;

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="font-medium text-gray-700 dark:text-gray-300">
          이번 달 아직 저축·투자로 옮기지 않은 여유자금
        </span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">{formatKrw(investableSurplus)}</p>
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
    </div>
  );
}
