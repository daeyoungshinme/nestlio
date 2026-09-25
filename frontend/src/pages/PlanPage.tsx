import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import CashflowPlanTab from "@/components/financialPlan/CashflowPlanTab";
import Tabs from "@/components/common/Tabs";
import { PLAN_VIEWS, type PlanView } from "@/constants/routes";

// 계획 탭: 연간계획(원본)과 이번 달(조정·점검) 두 보기만 둔다. 재무목표는 독립 탭(/goals)으로 분리됐다.
function isView(value: string | null): value is PlanView {
  return (PLAN_VIEWS as readonly string[]).includes(value ?? "");
}

export default function PlanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const activeView: PlanView = isView(viewParam) ? viewParam : "이번 달";

  // ?view= 없이 진입하면 기본 보기를 URL에 고정해 뒤로가기/공유 시 같은 화면이 열리게 한다.
  useEffect(() => {
    if (!isView(viewParam)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", activeView);
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react/exhaustive-deps -- 마운트 시 1회만 기본 ?view=를 채운다
  }, []);

  const handleChange = (view: PlanView) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", view);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-3 px-3 py-2 bg-gray-50 dark:bg-gray-950 lg:static lg:mx-0 lg:px-0 lg:py-0 lg:bg-transparent">
        <Tabs tabs={PLAN_VIEWS} activeTab={activeView} onChange={handleChange} variant="pill" fullWidth />
      </div>
      <CashflowPlanTab view={activeView === "연간" ? "annual" : "monthly"} />
    </div>
  );
}
