import { useState } from "react";
import CashflowPlanTab from "@/components/financialPlan/CashflowPlanTab";
import GoalsTab from "@/components/financialPlan/GoalsTab";
import Tabs from "@/components/common/Tabs";

const PAGE_TABS = ["현금흐름 계획", "목표"] as const;
type PageTab = (typeof PAGE_TABS)[number];

// "예산"은 현금흐름 계획 탭의 각 지출 섹션(고정/변동/비정기) 안에 통합됐다.
// "챌린지"는 재무목표와 개념이 겹쳐(둘 다 진행률 바 + 목표/현재 금액) 재무목표 탭 하단의
// 서브섹션으로 흡수됐다(GoalsTab 참고).
// "재무목표"(장기목표/챌린지/비정기목표)는 한동안 "저축·투자" 섹션 하위 서브섹션으로 흡수돼
// CashflowPlanTab 한 화면에 있었지만, 장기목표에도 "전체 목표 설정 → 월별 계획 자동산출 → 월별
// 달성 확인" 루프가 생기면서 다시 독립 탭으로 분리했다 — 개별 목표는 각자 다른 기간(목표일)을
// 기준으로 하는 반면 현금흐름 계획은 가계 전체의 달력월 기준이라 스코프가 근본적으로 달라졌기
// 때문(GoalsTab 참고). 다음에 또 흡수/분리를 고민할 때는 이 두 화면이 "같은 달력월 기준으로
// 계획 대비 실적을 비교하는가"를 기준으로 판단한다.
// 옛 tab=예산/챌린지/재무목표 딥링크는 더 이상 쓰이지 않는 파라미터라 자연히 무시된다.
export default function FinancialPlanPage() {
  const [activeTab, setActiveTab] = useState<PageTab>("현금흐름 계획");

  return (
    <div className="space-y-6">
      <Tabs tabs={PAGE_TABS} activeTab={activeTab} onChange={setActiveTab} variant="pill" fullWidth />
      {activeTab === "현금흐름 계획" ? <CashflowPlanTab /> : <GoalsTab />}
    </div>
  );
}
