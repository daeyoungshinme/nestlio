import AnnualPlanMonthlyGrid from "@/components/financialPlan/AnnualPlanMonthlyGrid";
import type { GoalMonthlyTargetIn } from "@/types";

interface Props {
  startMonth: string;
  endMonth: string;
  targets: GoalMonthlyTargetIn[];
  onChange: (targets: GoalMonthlyTargetIn[]) => void;
  /** "총액 균등분배"를 누르면 이 금액(필요금액 - 현재 저축액)을 남은 달에 고르게 나눠 채운다. */
  distributeAmount?: string;
}

/** 장기 목표(kind="goal") 폼의 월별 목표금액 편집기 — 연간계획과 같은 2열 격자·프리셋(AnnualPlanMonthlyGrid)을 쓴다.
 * 예전엔 한 달에 한 행이라 3년 목표면 36행을 스크롤해야 했다. 여러 해에 걸치면 해마다 접힌다. */
export default function GoalMonthlyTargetEditor({ startMonth, endMonth, targets, onChange, distributeAmount }: Props) {
  if (!startMonth || !endMonth || startMonth > endMonth) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">시작월과 종료월을 먼저 정해주세요.</p>;
  }
  return (
    <AnnualPlanMonthlyGrid
      startMonth={startMonth}
      endMonth={endMonth}
      targets={targets}
      onChange={onChange}
      distributeAmount={distributeAmount ?? "0"}
      totalHint="필요금액과 별개로 페이스 확인용이에요"
    />
  );
}
