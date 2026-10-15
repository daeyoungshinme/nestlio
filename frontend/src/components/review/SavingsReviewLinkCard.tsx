import { Link } from "react-router-dom";
import { ChevronRight, Scissors } from "lucide-react";
import { savingsReviewLink } from "@/constants/routes";

/** 절감 점검(`/review`) 진입 카드 — 주 메뉴에 없는 화면이라 홈과 계획 › 실적 분석에 둔다.
 * 계산이 무거워(최근 7개월 거래·예산·보험) 홈에서 금액을 미리 불러오지 않고 링크만 둔다. */
export default function SavingsReviewLinkCard() {
  return (
    <Link
      to={savingsReviewLink()}
      className="card flex items-center gap-3 min-h-[44px] hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
    >
      <Scissors size={18} className="shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">절감 점검</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">줄일 수 있는 지출과 보험료를 찾아봐요</p>
      </div>
      <ChevronRight size={16} className="shrink-0 text-gray-400" aria-hidden="true" />
    </Link>
  );
}
