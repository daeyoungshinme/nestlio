import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/** 현금흐름계획 탭의 "반복 거래 규칙 수정하기" 딥링크(`?recurring=manage`)로 들어오면
 * 반복 내역 관리 시트를 바로 열고, 그 파라미터를 URL에서 지운다. */
export function useRecurringDeepLink(): [boolean, (open: boolean) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showRecurringSheet, setShowRecurringSheet] = useState(false);

  useEffect(() => {
    if (searchParams.get("recurring") !== "manage") return;
    setShowRecurringSheet(true);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("recurring");
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react/exhaustive-deps -- setShowRecurringSheet/setSearchParams는 안정적, searchParams만 관찰
  }, [searchParams]);

  return [showRecurringSheet, setShowRecurringSheet];
}
