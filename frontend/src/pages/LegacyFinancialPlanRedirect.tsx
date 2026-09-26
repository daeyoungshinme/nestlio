import { Navigate, useSearchParams } from "react-router-dom";
import { ROUTES, planViewLink } from "@/constants/routes";

/** 구 `/financial-plan` 딥링크(`?view=목표|이번 달|연간`, 더 오래된 `?tab=현금흐름 계획|목표`,
 * `?view=이번 달 계획|연간계획`)를 새 `/goals`·`/plan?view=`로 옮긴다. 구 페이지의 기본 보기는 목표였다. */
export function legacyFinancialPlanTarget(params: URLSearchParams): string {
  const tab = params.get("tab");
  const view = params.get("view");
  if (view === "연간" || view === "연간계획") return planViewLink("연간");
  if (view === "이번 달" || view === "이번 달 계획" || tab === "현금흐름 계획") return planViewLink("이번 달");
  return ROUTES.goals;
}

export default function LegacyFinancialPlanRedirect() {
  const [searchParams] = useSearchParams();
  return <Navigate to={legacyFinancialPlanTarget(searchParams)} replace />;
}
