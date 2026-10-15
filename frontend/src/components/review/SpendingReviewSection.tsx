import { PiggyBank } from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import ReviewFindingCard from "@/components/review/ReviewFindingCard";
import { planViewLink, recurringManageLink } from "@/constants/routes";
import type { SavingOpportunityRule, SpendingReviewOut } from "@/types";

const RULE_LINKS: Record<SavingOpportunityRule, { to: string; label: string }> = {
  trend_up: { to: planViewLink("이번 달"), label: "이번 달 예산 보기" },
  benchmark_excess: { to: planViewLink("이번 달"), label: "이번 달 예산 보기" },
  chronic_overrun: { to: planViewLink("이번 달"), label: "예산 다시 잡기" },
  small_frequent: { to: planViewLink("이번 달"), label: "이번 달 예산 보기" },
  subscription: { to: recurringManageLink(), label: "반복 내역 관리" },
  unregistered_recurring: { to: recurringManageLink(), label: "반복 내역으로 등록" },
};

export default function SpendingReviewSection({ data }: { data: SpendingReviewOut }) {
  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="지금은 눈에 띄게 줄일 곳이 없어요"
        description={
          data.months_analyzed === 0
            ? "비교할 이전 달 기록이 쌓이면 더 정확히 찾아드릴게요."
            : `최근 ${data.months_analyzed}개월과 비교했어요. 잘 관리하고 계세요!`
        }
        compact
      />
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        최근 {data.months_analyzed}개월 평균과 비교했어요. 금액은 줄일 수 있는 최대치가 아니라 보수적인 추정이에요.
      </p>
      {data.items.map((item) => (
        <ReviewFindingCard
          key={`${item.rule_code}-${item.title}`}
          severity={item.severity}
          title={item.title}
          detail={item.detail}
          saving={item.estimated_monthly_saving}
          related={item.related}
          link={RULE_LINKS[item.rule_code]}
        />
      ))}
    </div>
  );
}
