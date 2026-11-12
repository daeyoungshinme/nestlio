import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Button from "@/components/common/Button";
import { fetchFailedGrowlioPushes, retryGrowlioPush } from "@/api/netWorth";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { errorCalloutClass, errorCalloutTextClass } from "@/utils/colors";
import { formatKrw } from "@/utils/format";
import { toast } from "@/utils/toast";
import type { GrowlioPushFailedOut } from "@/types";

const TYPE_LABEL: Record<GrowlioPushFailedOut["transaction_type"], string> = {
  DEPOSIT: "입금",
  WITHDRAWAL: "출금",
};

/** growlio 반영을 자동으로 포기한 저축·투자 입출금 경고. 계좌 연동이 끊기는 등 확정 오류로 여러 번 실패한
 * 건만 여기 온다(일시 장애는 다음 화면 로드 때 자동으로 다시 보낸다). 없으면 아무것도 그리지 않는다. */
export default function GrowlioPushFailuresBanner() {
  const queryClient = useQueryClient();
  const { data: failures } = useQuery({
    queryKey: QUERY_KEYS.growlioPushFailures,
    queryFn: fetchFailedGrowlioPushes,
  });
  const retry = useMutation({
    mutationFn: retryGrowlioPush,
    onSuccess: ({ sent }) => {
      toast(sent ? "growlio에 반영했어요." : "아직 반영하지 못했어요. 사유를 확인해 주세요.", sent ? "success" : "error");
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.netWorthAll });
    },
  });

  if (!failures || failures.length === 0) return null;

  return (
    <section className={`rounded-xl p-4 ${errorCalloutClass()}`} aria-labelledby="growlio-push-failures-title">
      <h2
        id="growlio-push-failures-title"
        className={`flex items-center gap-2 text-sm font-semibold ${errorCalloutTextClass()}`}
      >
        <AlertTriangle size={16} aria-hidden />
        growlio에 반영하지 못한 입출금 {failures.length}건
      </h2>
      <p className={`mt-1 text-xs ${errorCalloutTextClass()}`}>
        가계부에는 저장됐지만 growlio 계좌에는 빠져 있어요. 계좌 연동을 확인한 뒤 다시 보내 주세요.
      </p>
      <ul className="mt-3 space-y-2">
        {failures.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="truncate text-gray-800 dark:text-gray-100">
                {item.product_name ?? "삭제된 상품"} · {TYPE_LABEL[item.transaction_type]} {formatKrw(item.amount)}
              </p>
              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                {item.transaction_date}
                {item.last_error ? ` · ${item.last_error}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              loading={retry.isPending && retry.variables === item.id}
              disabled={retry.isPending}
              onClick={() => retry.mutate(item.id)}
            >
              다시 보내기
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
