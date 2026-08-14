import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";
import SkeletonCard from "@/components/common/SkeletonCard";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import AssetCompositionDonut from "@/components/accounts/AssetCompositionDonut";
import NetWorthTrendChart from "@/components/accounts/NetWorthTrendChart";
import { fetchNetWorth } from "@/api/netWorth";
import { fetchSavingsProducts, syncAllSavingsProducts } from "@/api/savingsProducts";
import { fetchLoans } from "@/api/loans";
import { syncAllAccounts } from "@/api/accounts";
import { syncAllRealEstate } from "@/api/realEstate";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { formatKrw, formatKrwCompact } from "@/utils/format";
import { computeRealEstateNet, splitSavingsAndRealEstate } from "@/utils/netWorth";
import { netWorthTextColor } from "@/utils/colors";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { GrowlioSyncAllOut, GrowlioSyncFailureOut } from "@/types";

export default function AccountsSnapshotCard() {
  const queryClient = useQueryClient();
  const [syncFailures, setSyncFailures] = useState<GrowlioSyncFailureOut[] | null>(null);
  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.netWorth, queryFn: () => fetchNetWorth(12) });
  // "저축·투자"/"부동산" 카드 분리용 — 같은 상품 목록(다른 탭들과 쿼리 키 공유, 추가 네트워크 요청
  // 없음)에서 부동산 몫만 빼는 계산은 splitSavingsAndRealEstate(utils/netWorth.ts)로 통일한다
  // (DashboardPage의 순자산 카드도 동일 함수를 써서 두 화면 숫자가 항상 일치하도록 보장).
  const { data: products } = useQuery({ queryKey: QUERY_KEYS.savingsProducts, queryFn: fetchSavingsProducts });
  // 도넛의 부동산 조각을 담보대출 순액으로 보여주기 위한 대출 목록(다른 탭들과 쿼리 키 공유,
  // 추가 네트워크 요청 없음) — growlio_account_id로 부동산 자산과 짝지어진 대출만 골라낸다
  // (app/services/real_estate_service.py의 담보대출 연동과 동일한 매칭 방식).
  const { data: loans } = useQuery({ queryKey: QUERY_KEYS.loans, queryFn: fetchLoans });

  // 계좌/저축·투자/부동산 탭에 흩어진 growlio 연동 항목을 한 번에 새로고침 — 각 리소스의 개별
  // "동기화" 버튼(건당 1개 항목)과 별개로, 이 카드가 모든 탭에 공통으로 뜨는 상단 요약이라 여기 둔다.
  // growlio는 요청자 자신의 JWT 기준으로만 자산을 스코프하므로(app/services/growlio_client.py) 배우자
  // 소유 항목은 이 계정으로는 애초에 조회되지 않는다 — 그런 항목은 failed로 걸러지고 개수만 안내한다.
  const syncAllMutation = useMutation({
    mutationFn: () =>
      Promise.allSettled([syncAllAccounts(), syncAllSavingsProducts(), syncAllRealEstate()]),
    onSuccess: (results) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.accounts });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProducts });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loans });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.netWorth });

      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<GrowlioSyncAllOut> => r.status === "fulfilled",
      );
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (fulfilled.length === 0) {
        toast(extractErrorMessage(rejected[0]?.reason), "error");
        return;
      }
      const syncedCount = fulfilled.reduce((sum, r) => sum + r.value.synced_count, 0);
      const failures = fulfilled.flatMap((r) => r.value.failed);
      const skippedCount = failures.length + rejected.length;
      if (syncedCount === 0 && skippedCount === 0) {
        toast("동기화할 growlio 연동 항목이 없어요.", "info");
      } else if (skippedCount > 0) {
        toast(
          `${syncedCount}개 동기화, ${skippedCount}개는 건너뛰었어요 (배우자 계정이거나 삭제됨).`,
          "info",
          failures.length > 0 ? { label: "자세히 보기", onClick: () => setSyncFailures(failures) } : undefined,
        );
      } else {
        toast(`${syncedCount}개 항목을 동기화했어요.`, "success");
      }
    },
  });

  if (isLoading || !data) {
    return <SkeletonCard rows={3} />;
  }

  const { current, history } = data;
  const netWorth = Number(current.net_worth);
  const accountsTotal = Number(current.accounts_total);
  const loansTotal = Number(current.loans_total);
  const { savingsInvestmentTotal, realEstateTotal } = splitSavingsAndRealEstate(Number(current.savings_total), products);
  const realEstateNetTotal = computeRealEstateNet(realEstateTotal, products, loans);
  const totalAssetsTotal = netWorth + loansTotal;

  return (
    <div className="space-y-3">
      <div className="card p-4 sm:p-5 space-y-4">
        <div className="flex flex-row items-start gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">순자산</p>
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw size={14} />}
                loading={syncAllMutation.isPending}
                onClick={() => syncAllMutation.mutate()}
              >
                전체 동기화
              </Button>
            </div>
            <p className={`text-xl sm:text-3xl lg:text-4xl font-bold ${netWorthTextColor(netWorth)}`}>
              {formatKrwCompact(netWorth)}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 truncate">{formatKrw(current.net_worth)}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              총자산 {formatKrwCompact(totalAssetsTotal)} − 대출 {formatKrwCompact(loansTotal)} = 순자산{" "}
              {formatKrwCompact(netWorth)}
            </p>
          </div>

          <AssetCompositionDonut
            accounts={accountsTotal}
            savingsInvestment={savingsInvestmentTotal}
            realEstate={realEstateNetTotal}
          />
        </div>
      </div>

      <CollapsibleGroup
        header={<span className="text-sm font-medium text-gray-600 dark:text-gray-400">순자산 추이</span>}
        defaultOpen={false}
      >
        <NetWorthTrendChart history={history} />
      </CollapsibleGroup>

      {syncFailures != null && (
        <Modal title="건너뛴 항목" onClose={() => setSyncFailures(null)} size="sm" closeOnBackdrop>
          <ul className="p-4 space-y-2 overflow-y-auto">
            {syncFailures.map((failure) => (
              <li key={failure.id} className="text-sm">
                <span className="font-medium text-gray-900 dark:text-gray-50">{failure.name}</span>
                <span className="text-gray-400 dark:text-gray-500"> — {failure.reason}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
