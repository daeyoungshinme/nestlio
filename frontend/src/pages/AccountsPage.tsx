import { useEffect } from "react";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import AccountsSection from "@/components/accounts/AccountsSection";
import CardsSection from "@/components/accounts/CardsSection";
import AccountsSnapshotCard from "@/components/accounts/AccountsSnapshotCard";
import GrowlioPushFailuresBanner from "@/components/accounts/GrowlioPushFailuresBanner";
import SavingsProductsSection from "@/components/accounts/SavingsProductsSection";
import RealEstateSection from "@/components/accounts/RealEstateSection";
import LoansSection from "@/components/accounts/LoansSection";
import { useNetWorth, useSavingsProducts, useUsers } from "@/hooks/useReferenceData";
import { formatKrwCompact } from "@/utils/format";
import { splitSavingsAndRealEstate } from "@/utils/netWorth";
import { ACCOUNTS_SECTIONS, type AccountsSection as AccountsSectionName } from "@/constants/routes";
import { useTabParam } from "@/hooks/useTabParam";

const SECTIONS = ACCOUNTS_SECTIONS;
type Section = AccountsSectionName;

function sectionId(name: Section): string {
  return `section-${name.replace(/·/g, "")}`;
}

/** 자산 화면 — 순자산 스냅샷 + 계좌/저축·투자/부동산/대출을 한 화면에 세로로 쌓는다(구 4개
 * pill 탭을 대체). 접힌 섹션은 마운트되지 않아 해당 쿼리도 열 때 처음 실행된다. `?section=`
 * (구 `?tab=` 딥링크도 호환)으로 진입하면 그 섹션만 펼치고 스크롤한다. */
export default function AccountsPage() {
  const [openSection, , fromDeepLink] = useTabParam("section", SECTIONS, "계좌", { legacyKeys: ["tab"] });

  const { data: users } = useUsers();
  // 스냅샷 카드와 같은 쿼리(캐시 공유)로 섹션 헤더에 합계를 붙인다 — 접힌 섹션도 펼치지 않고 규모를 본다.
  const { data: netWorth } = useNetWorth(12);
  const { data: products } = useSavingsProducts();
  const sectionTotals: Partial<Record<Section, string>> = {};
  if (netWorth) {
    sectionTotals["계좌"] = formatKrwCompact(Number(netWorth.current.accounts_total));
    sectionTotals["대출"] = formatKrwCompact(Number(netWorth.current.loans_total));
    // 상품 목록이 오기 전(또는 실패)엔 부동산 몫을 모른다 — 0원으로 두면 "저축·투자"에 부동산이 섞이고
    // "부동산"이 0원으로 보이므로 두 합계는 비워 둔다.
    if (products) {
      const { savingsInvestmentTotal, realEstateTotal } = splitSavingsAndRealEstate(
        Number(netWorth.current.savings_total),
        products,
      );
      sectionTotals["저축·투자"] = formatKrwCompact(savingsInvestmentTotal);
      sectionTotals["부동산"] = formatKrwCompact(realEstateTotal);
    }
  }

  useEffect(() => {
    if (fromDeepLink) {
      document.getElementById(sectionId(openSection))?.scrollIntoView({ block: "start" });
    }
    // eslint-disable-next-line react/exhaustive-deps -- 마운트 시 1회만 딥링크(?section=)로 스크롤
  }, []);

  return (
    <div className="space-y-6">
      <GrowlioPushFailuresBanner />
      <AccountsSnapshotCard />

      <div id={sectionId("계좌")} className="scroll-mt-4">
        <CollapsibleGroup
          header={<span className="text-base font-semibold text-gray-800 dark:text-gray-100">계좌</span>}
          amount={sectionTotals["계좌"]}
          defaultOpen={openSection === "계좌"}
        >
          <div className="space-y-6">
            <AccountsSection users={users} />
            <CardsSection users={users} />
          </div>
        </CollapsibleGroup>
      </div>

      <div id={sectionId("저축·투자")} className="scroll-mt-4">
        <CollapsibleGroup
          header={<span className="text-base font-semibold text-gray-800 dark:text-gray-100">저축·투자</span>}
          amount={sectionTotals["저축·투자"]}
          defaultOpen={openSection === "저축·투자"}
        >
          <SavingsProductsSection users={users} />
        </CollapsibleGroup>
      </div>

      <div id={sectionId("부동산")} className="scroll-mt-4">
        <CollapsibleGroup
          header={<span className="text-base font-semibold text-gray-800 dark:text-gray-100">부동산</span>}
          amount={sectionTotals["부동산"]}
          defaultOpen={openSection === "부동산"}
        >
          <RealEstateSection users={users} />
        </CollapsibleGroup>
      </div>

      <div id={sectionId("대출")} className="scroll-mt-4">
        <CollapsibleGroup
          header={<span className="text-base font-semibold text-gray-800 dark:text-gray-100">대출</span>}
          amount={sectionTotals["대출"]}
          defaultOpen={openSection === "대출"}
        >
          <LoansSection users={users} />
        </CollapsibleGroup>
      </div>
    </div>
  );
}
