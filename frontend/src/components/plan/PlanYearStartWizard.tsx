import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, History, Repeat } from "lucide-react";
import type { ReactNode } from "react";
import { seedAnnualPlan } from "@/api/annualPlan";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { AnnualPlanSeedIn } from "@/types";

const OPTIONS: { source: AnnualPlanSeedIn["source"]; icon: ReactNode; title: string; description: string }[] = [
  {
    source: "previous_year",
    icon: <History size={18} aria-hidden="true" />,
    title: "작년 계획 이어가기",
    description: "작년 연간계획의 항목과 월별 금액을 그대로 가져와요.",
  },
  {
    source: "recurring",
    icon: <Repeat size={18} aria-hidden="true" />,
    title: "반복 거래로 채우기",
    description: "월급·월세·구독처럼 등록된 반복 거래로 고정 수입·지출을 채워요.",
  },
  {
    source: "recent_average",
    icon: <CalendarRange size={18} aria-hidden="true" />,
    title: "최근 3개월 평균으로 채우기",
    description: "가계부의 최근 3개월 카테고리별 평균으로 매달 같은 금액을 채워요.",
  },
];

/** 연간계획이 비어 있는 해에 보여주는 "새해 계획 시작" 카드. 빈 화면에서 항목을 하나씩 만드는 대신 이미 가진
 * 데이터(작년 계획/반복 거래/최근 실적)로 한 번에 초안을 만들고, 부부가 아코디언에서 고쳐 쓰게 한다.
 * 백엔드는 이미 항목이 있으면 409로 막는다(annual_plan_service.seed_year). */
export default function PlanYearStartWizard({ year }: { year: number }) {
  const queryClient = useQueryClient();
  const seedMutation = useMutation({
    mutationFn: (source: AnnualPlanSeedIn["source"]) => seedAnnualPlan({ year, source }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.annualPlanAll });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cashflowPlanAll });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      toast(`${year}년 계획 초안을 만들었어요. 항목별로 금액을 조정해 보세요.`, "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <div className="card space-y-3">
      <div>
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-50">{year}년 계획을 시작해요</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          초안을 만든 뒤 아래 섹션에서 부부가 함께 금액을 조정하면 돼요. 직접 항목을 하나씩 추가해도 좋아요.
        </p>
      </div>
      <div className="grid gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.source}
            type="button"
            disabled={seedMutation.isPending}
            onClick={() => seedMutation.mutate(option.source)}
            className="flex items-start gap-3 w-full text-left rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 min-h-[56px] hover:border-primary-300 hover:bg-primary-50 dark:hover:border-primary-700 dark:hover:bg-primary-950 transition-colors disabled:opacity-50"
          >
            <span className="mt-0.5 text-primary-600 dark:text-primary-400">{option.icon}</span>
            <span>
              <span className="block text-sm font-semibold text-gray-900 dark:text-gray-50">{option.title}</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">{option.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
