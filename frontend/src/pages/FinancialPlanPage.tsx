import { useSearchParams } from "react-router-dom";
import CashflowPlanTab from "@/components/financialPlan/CashflowPlanTab";
import GoalsTab from "@/components/financialPlan/GoalsTab";
import Tabs from "@/components/common/Tabs";

const PAGE_TABS = ["현금흐름 계획", "목표"] as const;
type PageTab = (typeof PAGE_TABS)[number];

function isPageTab(value: string | null): value is PageTab {
  return (PAGE_TABS as readonly string[]).includes(value ?? "");
}

// "예산"은 현금흐름 계획 탭의 각 지출 섹션(고정/변동/비정기) 안에 통합됐다.
// "챌린지"는 백엔드에서 이미 FinancialGoal(kind="challenge")로 재무목표에 통합돼 있었지만,
// 한동안 GoalsTab이 별도 버튼·카드·폼으로 취급해 사용자에게는 오히려 독립된 개념처럼 보였다.
// 지금은 "목표 추가" 진입점 하나에서 유형(장기 목표/챌린지)만 고르고, 카드에도 배지로만
// 구분해 붙는다 — 유형 선택은 생성 시에만 가능하다(GoalsTab 참고).
// "재무목표"(장기목표/챌린지/비정기목표)는 한동안 "저축·투자" 섹션 하위 서브섹션으로 흡수돼
// CashflowPlanTab 한 화면에 있었지만, 장기목표에도 "전체 목표 설정 → 월별 계획 자동산출 → 월별
// 달성 확인" 루프가 생기면서 다시 독립 탭으로 분리했다 — 개별 목표는 각자 다른 기간(목표일)을
// 기준으로 하는 반면 현금흐름 계획은 가계 전체의 달력월 기준이라 스코프가 근본적으로 달라졌기
// 때문(GoalsTab 참고). 다음에 또 흡수/분리를 고민할 때는 이 두 화면이 "같은 달력월 기준으로
// 계획 대비 실적을 비교하는가"를 기준으로 판단한다.
// tab= 쿼리 파라미터로 딥링크 가능(대시보드 카드, 탭 간 상호 이동 링크 등). 옛 tab=예산/챌린지
// 딥링크처럼 PAGE_TABS에 없는 값은 자연히 무시되고 기본 탭("현금흐름 계획")으로 떨어진다.
export default function FinancialPlanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: PageTab = isPageTab(tabParam) ? tabParam : "현금흐름 계획";

  const handleChange = (tab: PageTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-6">
      <Tabs tabs={PAGE_TABS} activeTab={activeTab} onChange={handleChange} variant="pill" fullWidth />
      {activeTab === "현금흐름 계획" ? <CashflowPlanTab /> : <GoalsTab />}
    </div>
  );
}
