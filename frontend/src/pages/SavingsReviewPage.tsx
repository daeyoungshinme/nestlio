import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import MonthPicker from "@/components/common/MonthPicker";
import QueryBoundary from "@/components/common/QueryBoundary";
import SkeletonCard from "@/components/common/SkeletonCard";
import Tabs from "@/components/common/Tabs";
import InsuranceReviewSection from "@/components/review/InsuranceReviewSection";
import SpendingReviewSection from "@/components/review/SpendingReviewSection";
import { fetchSavingsReview } from "@/api/reports";
import { STALE_TIME } from "@/constants/queryConfig";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { SAVINGS_REVIEW_TABS, type SavingsReviewTab } from "@/constants/routes";
import { useUsers } from "@/hooks/useReferenceData";
import { currentYearMonth, shiftYearMonth } from "@/utils/date";
import { formatKrw, formatKrwCompact, formatYearMonth } from "@/utils/format";

const ALL_OWNERS_TAB = "전체";
const SHARED_OWNER_TAB = "공통";

function isTab(value: string | null): value is SavingsReviewTab {
  return (SAVINGS_REVIEW_TABS as readonly string[]).includes(value ?? "");
}

/** 절감 점검 — 소비 절감 후보(지난달 기준, 최근 평균과 비교)와 보험 계약 점검. 규칙 기반이며 백엔드
 * spending_review_service / insurance_review_service가 계산한다. 기준월 기본값은 지난달(마감된 달). */
export default function SavingsReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: SavingsReviewTab = isTab(tabParam) ? tabParam : "소비";
  const [yearMonth, setYearMonth] = useState(() => shiftYearMonth(currentYearMonth(), -1));
  const [ownerTab, setOwnerTab] = useState(ALL_OWNERS_TAB);
  const { data: users } = useUsers();

  const ownerTabs = [ALL_OWNERS_TAB, ...(users?.map((u) => u.display_name) ?? []), SHARED_OWNER_TAB];
  const ownerParam =
    ownerTab === ALL_OWNERS_TAB
      ? undefined
      : ownerTab === SHARED_OWNER_TAB
        ? "shared"
        : users?.find((u) => u.display_name === ownerTab)?.id;

  const reviewQuery = useQuery({
    queryKey: QUERY_KEYS.savingsReview(yearMonth, ownerParam),
    queryFn: () => fetchSavingsReview(yearMonth, ownerParam),
    staleTime: STALE_TIME.MEDIUM,
  });

  const changeTab = (tab: SavingsReviewTab) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="space-y-4">
      {/* 보험은 고른 달과 무관하게 지금 계약 기준이라 달 선택은 소비 탭에서만 보인다. */}
      {activeTab === "소비" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <MonthPicker yearMonth={yearMonth} onChange={setYearMonth} />
        </div>
      )}

      <QueryBoundary query={reviewQuery} errorMessage="절감 점검을 불러오지 못했어요." loadingFallback={<SkeletonCard rows={4} />}>
        {(data) => (
          <div className="space-y-4">
            <div className="card">
              <p className="text-xs text-gray-500 dark:text-gray-400">월 절감 여력</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-50">월 {formatKrw(data.total_estimated_monthly_saving)}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {/* 소비는 고른 달 기준, 보험은 고른 달과 무관하게 지금 유지 중인 계약 기준이다. */}
                소비({formatYearMonth(data.year_month)}) {formatKrwCompact(Number(data.spending.total_estimated_monthly_saving))}{" "}
                · 보험 {formatKrwCompact(Number(data.insurance.total_estimated_monthly_saving))}
                {ownerParam ? ` (소비는 ${ownerTab} 몫만)` : ""}
              </p>
            </div>

            <Tabs tabs={SAVINGS_REVIEW_TABS} activeTab={activeTab} onChange={changeTab} variant="pill" fullWidth />

            {activeTab === "소비" ? (
              <div className="space-y-3">
                <Tabs tabs={ownerTabs} activeTab={ownerTab} onChange={setOwnerTab} variant="underline" />
                <SpendingReviewSection data={data.spending} />
              </div>
            ) : (
              <InsuranceReviewSection data={data.insurance} />
            )}
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
