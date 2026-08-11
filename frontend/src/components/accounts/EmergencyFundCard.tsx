import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import { fetchSettings, setEmergencyFund } from "@/api/settings";
import { INLINE_BUTTON_OFFSET } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { formatKrwPreview, toAmountInputValue } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";

/** 목표(target)가 아니라 현재 잔액 스냅샷이라 목표탭이 아닌 자산현황에 둔다 — 저축·투자현황/
 * 대출현황이 같은 이유로 이 페이지로 옮겨온 것과 동일한 논리(frontend/CLAUDE.md 참고). 잔액이
 * 부족할 때의 안내는 대시보드의 InvestSurplusCard에서만 보여준다(여기서는 중복 표시하지 않음). */
export default function EmergencyFundCard() {
  const [draft, setDraft] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: settingsData } = useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: fetchSettings,
    staleTime: STALE_TIME.MEDIUM,
  });

  const saveFundMutation = useMutation({
    mutationFn: setEmergencyFund,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      toast("비상금 잔액이 저장되었습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const fundValue =
    draft ?? (settingsData?.emergency_fund_balance ? toAmountInputValue(settingsData.emergency_fund_balance) : "");

  return (
    <div className="card space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">비상금</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        부부가 함께 모아둔 비상금 잔액이에요. 대시보드 코칭에서 고정지출 대비 몇 개월치인지 알려드려요.
      </p>
      <div className="flex items-start flex-wrap gap-3">
        <FormInput
          label="비상금 잔액"
          type="number"
          inputMode="decimal"
          value={fundValue}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full sm:w-40"
          preview={Number(fundValue) > 0 ? formatKrwPreview(Number(fundValue)) : undefined}
        />
        <Button
          size="sm"
          loading={saveFundMutation.isPending}
          onClick={() => saveFundMutation.mutate(fundValue)}
          className={`${INLINE_BUTTON_OFFSET} ${TOUCH_TARGET_MIN_HEIGHT}`}
        >
          저장
        </Button>
      </div>
    </div>
  );
}
