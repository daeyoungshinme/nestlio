import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ASSET_RELATED_KEYS } from "@/constants/queryKeys";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";

/** 자산 섹션(계좌/저축·투자/부동산)의 행 단위 "growlio 동기화" 버튼 mutation. 동기화는 잔액을 바꾸므로
 * 순자산·대시보드·목표 진행률까지 묶인 ASSET_RELATED_KEYS를 무효화한다 — 부동산은 짝 담보대출 잔액도
 * 함께 갱신되는데(app/services/real_estate_service.py) loans 키가 이 묶음에 들어 있어 따로 챙길 필요가 없다. */
export function useGrowlioSyncMutation<T>(syncFn: (id: number) => Promise<T>, successMessage: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: syncFn,
    onSuccess: () => {
      ASSET_RELATED_KEYS.forEach((key) => void queryClient.invalidateQueries({ queryKey: key }));
      toast(successMessage, "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });
}
