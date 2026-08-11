import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import { fetchSettings, setEmergencyFund } from "@/api/settings";
import { INLINE_BUTTON_OFFSET } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { STALE_TIME } from "@/constants/queryConfig";
import { TOUCH_TARGET_MIN_HEIGHT, TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import { formatKrw, formatKrwPreview, toAmountInputValue } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";

/** 목표(target)가 아니라 현재 잔액 스냅샷이라 목표탭이 아닌 자산현황에 둔다 — 저축·투자현황/
 * 대출현황이 같은 이유로 이 페이지로 옮겨온 것과 동일한 논리(frontend/CLAUDE.md 참고). 잔액이
 * 부족할 때의 안내는 대시보드의 InvestSurplusCard에서만 보여준다(여기서는 중복 표시하지 않음). */
export default function EmergencyFundCard() {
  const [isEditing, setIsEditing] = useState(false);
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
      setIsEditing(false);
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const fundValue =
    draft ?? (settingsData?.emergency_fund_balance ? toAmountInputValue(settingsData.emergency_fund_balance) : "");

  const handleCancel = () => {
    setDraft(null);
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="card flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">비상금</p>
          <p className="mt-1 text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-50 truncate">
            {formatKrw(settingsData?.emergency_fund_balance ?? 0)}
          </p>
        </div>
        <button
          onClick={() => setIsEditing(true)}
          aria-label="비상금 수정"
          className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg transition-colors shrink-0`}
        >
          <Pencil size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="card space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">비상금</h3>
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
        <div className={`flex gap-2 ${INLINE_BUTTON_OFFSET}`}>
          <Button
            size="sm"
            loading={saveFundMutation.isPending}
            onClick={() => saveFundMutation.mutate(fundValue)}
            className={TOUCH_TARGET_MIN_HEIGHT}
          >
            저장
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCancel} className={TOUCH_TARGET_MIN_HEIGHT}>
            취소
          </Button>
        </div>
      </div>
    </div>
  );
}
