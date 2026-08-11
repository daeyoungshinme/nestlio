import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";
import { fetchGrowlioAccounts, importGrowlioAccounts } from "@/api/savingsProducts";
import { fetchGrowlioRealEstate, importGrowlioRealEstate } from "@/api/realEstate";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { growlioAssetTypeLabel } from "@/constants/growlio";
import { formatKrw } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";

type ImportItem =
  | { kind: "investment"; id: string; name: string; amount: number; assetType: string }
  | { kind: "real_estate"; id: string; name: string; amount: number; address: string | null; mortgageBalance: number };

/** 저축·투자 탭의 growlio 가져오기 모달. 증권/현금성 계좌(투자)와 부동산(시세+담보대출 페어)은
 * 응답 계약이 서로 달라(단일 금액 vs 자산·대출 페어) 백엔드 엔드포인트는 분리돼 있지만,
 * 사용자에게는 "growlio에서 가져오기" 하나로 보이도록 두 목록을 병합해 하나의 모달로 보여준다. */
export default function GrowlioSavingsImportModal({
  existingGrowlioAccountIds,
  onClose,
}: {
  existingGrowlioAccountIds: Set<string>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const investmentQuery = useQuery({
    queryKey: QUERY_KEYS.growlioInvestmentAccounts,
    queryFn: fetchGrowlioAccounts,
    retry: false,
  });
  const realEstateQuery = useQuery({
    queryKey: QUERY_KEYS.growlioRealEstateAccounts,
    queryFn: fetchGrowlioRealEstate,
    retry: false,
  });

  const isLoading = investmentQuery.isLoading || realEstateQuery.isLoading;
  const isError = investmentQuery.isError || realEstateQuery.isError;
  const errorMessage = extractErrorMessage(
    investmentQuery.error ?? realEstateQuery.error,
    "growlio 계좌를 불러오지 못했습니다.",
  );

  const items: ImportItem[] = [
    ...(investmentQuery.data ?? []).map((account): ImportItem => ({
      kind: "investment",
      id: account.id,
      name: account.name,
      amount: account.current_value_krw,
      assetType: account.asset_type,
    })),
    ...(realEstateQuery.data ?? []).map((item): ImportItem => ({
      kind: "real_estate",
      id: item.id,
      name: item.name,
      amount: item.market_value_krw,
      address: item.address,
      mortgageBalance: item.mortgage_balance_krw,
    })),
  ]
    .filter((item) => !existingGrowlioAccountIds.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const allSelected = items.length > 0 && selected.size === items.length;
  const selectedTotal = items.filter((item) => selected.has(item.id)).reduce((sum, item) => sum + item.amount, 0);

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const investmentIds = items.filter((item) => item.kind === "investment" && selected.has(item.id)).map((item) => item.id);
      const realEstateIds = items.filter((item) => item.kind === "real_estate" && selected.has(item.id)).map((item) => item.id);
      const [investmentResults, realEstateResults] = await Promise.all([
        investmentIds.length > 0 ? importGrowlioAccounts({ growlio_account_ids: investmentIds }) : Promise.resolve([]),
        realEstateIds.length > 0 ? importGrowlioRealEstate({ growlio_account_ids: realEstateIds }) : Promise.resolve([]),
      ]);
      return { investmentResults, realEstateResults };
    },
    onSuccess: ({ investmentResults, realEstateResults }) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsProducts });
      if (realEstateResults.length > 0) {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.loans });
      }
      const count = investmentResults.length + realEstateResults.length;
      const total =
        investmentResults.reduce((sum, product) => sum + Number(product.current_balance), 0) +
        realEstateResults.reduce((sum, result) => sum + Number(result.savings_product.current_balance), 0);
      const loanCount = realEstateResults.filter((result) => result.loan !== null).length;
      toast(
        `growlio 계좌 ${count}개를 가져왔습니다. 합계 ${formatKrw(total)}` +
          (loanCount > 0 ? ` · 담보대출 ${loanCount}건도 함께 등록했어요.` : ""),
        "success",
      );
      onClose();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <Modal onClose={onClose} title="growlio에서 가져오기">
      <div className="p-6 overflow-y-auto flex flex-col gap-3">
        {isLoading && <p className="text-xs text-gray-400">growlio 계좌를 불러오는 중…</p>}
        {isError && <p className="text-xs text-red-500">{errorMessage}</p>}
        {!isLoading && !isError && items.length === 0 && (
          <p className="text-xs text-gray-400">가져올 수 있는 growlio 계좌가 없어요.</p>
        )}
        {items.length > 0 && (
          <>
            <label className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
              전체 선택 ({items.length}개)
            </label>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {items.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleOne(item.id)}
                      className="rounded shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{item.name}</span>
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          {item.kind === "investment" ? growlioAssetTypeLabel(item.assetType) : "부동산"}
                        </span>
                      </span>
                      {item.kind === "real_estate" && item.address && (
                        <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate">{item.address}</span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-gray-500 dark:text-gray-400">
                    <span className="block">{formatKrw(item.amount)}</span>
                    {item.kind === "real_estate" && item.mortgageBalance > 0 && (
                      <span className="block text-[11px] text-amber-600 dark:text-amber-400">
                        대출 {formatKrw(item.mortgageBalance)}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
        <Button
          type="button"
          loading={importMutation.isPending}
          disabled={selected.size === 0}
          onClick={() => importMutation.mutate()}
          className="mt-2"
        >
          {selected.size > 0 ? `${selected.size}개 가져오기 · 합계 ${formatKrw(selectedTotal)}` : "가져오기"}
        </Button>
      </div>
    </Modal>
  );
}
