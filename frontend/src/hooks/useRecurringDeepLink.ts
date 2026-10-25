import { useState } from "react";
import { useConsumeSearchParam } from "@/hooks/useConsumeSearchParam";

/** 현금흐름계획 탭의 "반복 거래 규칙 수정하기" 딥링크(`recurringManageLink()` — `?recurring=manage`)로 들어오면
 * 반복 내역 관리 시트를 바로 열고, 그 파라미터를 URL에서 지운다. */
export function useRecurringDeepLink(): [boolean, (open: boolean) => void] {
  const [showRecurringSheet, setShowRecurringSheet] = useState(false);
  useConsumeSearchParam("recurring", (value) => {
    if (value === "manage") setShowRecurringSheet(true);
  });
  return [showRecurringSheet, setShowRecurringSheet];
}
