import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import CashflowPlanTab from "@/components/financialPlan/CashflowPlanTab";
import GoalsTab from "@/components/financialPlan/GoalsTab";
import Tabs from "@/components/common/Tabs";

// 목표 페이지는 예전에 페이지 탭(현금흐름 계획/목표) → 뷰 서브탭(이번 달 계획/연간계획) →
// 섹션 탭(수입/고정/변동/비정기/저축투자)까지 3단계로 중첩돼 있었다. 커플이 이 화면을 여는
// 이유는 늘 "목표가 뭐고 이번 달·올해 얼마"라서, 상위 두 단계를 하나의 세그먼트로 합쳤다.
// 재무목표(목표일 기준)와 현금흐름 계획(달력월 기준)은 스코프가 다르지만 세그먼트 안에서만
// 갈라지면 충분하다.
const VIEWS = ["목표", "이번 달", "연간"] as const;
type View = (typeof VIEWS)[number];

function isView(value: string | null): value is View {
  return (VIEWS as readonly string[]).includes(value ?? "");
}

/** 구 딥링크(?tab=현금흐름 계획, ?tab=목표, ?view=이번 달 계획/연간계획)를 새 ?view= 값으로 정규화. */
function legacyView(params: URLSearchParams): View | null {
  const tab = params.get("tab");
  const view = params.get("view");
  if (tab === "목표") return "목표";
  if (view === "연간계획") return "연간";
  if (view === "이번 달 계획") return "이번 달";
  if (tab === "현금흐름 계획") return "이번 달";
  return null;
}

export default function FinancialPlanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const activeView: View = isView(viewParam) ? viewParam : (legacyView(searchParams) ?? "목표");

  // 구 파라미터(tab= 등)로 진입하면 표준 ?view= 하나로 URL을 정리한다.
  useEffect(() => {
    if (!isView(viewParam) || searchParams.has("tab")) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("tab");
          next.set("view", activeView);
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (view: View) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("tab");
        next.set("view", view);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-3 px-3 py-2 bg-gray-50 dark:bg-gray-950 lg:static lg:mx-0 lg:px-0 lg:py-0 lg:bg-transparent">
        <Tabs tabs={VIEWS} activeTab={activeView} onChange={handleChange} variant="pill" fullWidth />
      </div>
      {activeView === "목표" ? (
        <GoalsTab />
      ) : (
        <CashflowPlanTab view={activeView === "연간" ? "annual" : "monthly"} />
      )}
    </div>
  );
}
