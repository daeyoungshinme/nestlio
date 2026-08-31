import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import AccountsSection from "@/components/accounts/AccountsSection";
import AccountsSnapshotCard from "@/components/accounts/AccountsSnapshotCard";
import SavingsProductsSection from "@/components/accounts/SavingsProductsSection";
import RealEstateSection from "@/components/accounts/RealEstateSection";
import LoansSection from "@/components/accounts/LoansSection";
import { fetchUsers } from "@/api/users";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";

const SECTIONS = ["계좌", "저축·투자", "부동산", "대출"] as const;
type Section = (typeof SECTIONS)[number];

function sectionId(name: Section): string {
  return `section-${name.replace(/·/g, "")}`;
}

/** 자산 화면 — 순자산 스냅샷 + 계좌/저축·투자/부동산/대출을 한 화면에 세로로 쌓는다(구 4개
 * pill 탭을 대체). 접힌 섹션은 마운트되지 않아 해당 쿼리도 열 때 처음 실행된다. `?section=`
 * (구 `?tab=` 딥링크도 호환)으로 진입하면 그 섹션만 펼치고 스크롤한다. */
export default function AccountsPage() {
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("section") ?? searchParams.get("tab");
  const openSection: Section = (SECTIONS as readonly string[]).includes(requested ?? "")
    ? (requested as Section)
    : "계좌";

  const { data: users } = useQuery({ queryKey: QUERY_KEYS.users, queryFn: fetchUsers, staleTime: STALE_TIME.LONG });

  useEffect(() => {
    if (requested && (SECTIONS as readonly string[]).includes(requested)) {
      document.getElementById(sectionId(requested as Section))?.scrollIntoView({ block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <AccountsSnapshotCard />

      <div id={sectionId("계좌")} className="scroll-mt-4">
        <CollapsibleGroup
          header={<span className="text-base font-semibold text-gray-800 dark:text-gray-100">계좌</span>}
          defaultOpen={openSection === "계좌"}
        >
          <AccountsSection users={users} />
        </CollapsibleGroup>
      </div>

      <div id={sectionId("저축·투자")} className="scroll-mt-4">
        <CollapsibleGroup
          header={<span className="text-base font-semibold text-gray-800 dark:text-gray-100">저축·투자</span>}
          defaultOpen={openSection === "저축·투자"}
        >
          <SavingsProductsSection users={users} />
        </CollapsibleGroup>
      </div>

      <div id={sectionId("부동산")} className="scroll-mt-4">
        <CollapsibleGroup
          header={<span className="text-base font-semibold text-gray-800 dark:text-gray-100">부동산</span>}
          defaultOpen={openSection === "부동산"}
        >
          <RealEstateSection users={users} />
        </CollapsibleGroup>
      </div>

      <div id={sectionId("대출")} className="scroll-mt-4">
        <CollapsibleGroup
          header={<span className="text-base font-semibold text-gray-800 dark:text-gray-100">대출</span>}
          defaultOpen={openSection === "대출"}
        >
          <LoansSection users={users} />
        </CollapsibleGroup>
      </div>
    </div>
  );
}
