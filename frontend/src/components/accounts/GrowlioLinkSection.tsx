import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { Link2, Unlink } from "lucide-react";
import Button from "@/components/common/Button";
import { setGrowlioLink } from "@/api/savingsProducts";
import { extractErrorMessage } from "@/utils/error";
import { formatKrw } from "@/utils/format";
import { toast } from "@/utils/toast";

interface Props<T> {
  productId: number;
  growlioAccountId: string | null;
  queryKey: QueryKey;
  fetchRows: () => Promise<T[]>;
  getRowId: (row: T) => string;
  getRowLabel: (row: T) => string;
  getRowAmount: (row: T) => number;
  invalidateKeys: QueryKey[];
  onLinked: () => void;
}

/** 저축/투자 상품과 부동산(둘 다 SavingsProduct 리소스, `PUT /savings-products/{id}/growlio-link`를 공유)이
 * 같이 쓰는 growlio 연동/해제 UI. 후보 목록 조회(`fetchRows`)와 행 표시 방식만 리소스별로 다르다. */
export default function GrowlioLinkSection<T>({
  productId,
  growlioAccountId,
  queryKey,
  fetchRows,
  getRowId,
  getRowLabel,
  getRowAmount,
  invalidateKeys,
  onLinked,
}: Props<T>) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: rows, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: fetchRows,
    enabled: pickerOpen,
    retry: false,
  });

  const linkMutation = useMutation({
    mutationFn: (nextGrowlioAccountId: string | null) =>
      setGrowlioLink(productId, { growlio_account_id: nextGrowlioAccountId, auto_sync_enabled: true }),
    onSuccess: () => {
      invalidateKeys.forEach((key) => void queryClient.invalidateQueries({ queryKey: key }));
      toast("growlio 연동을 저장했습니다.", "success");
      // 이 모달의 product prop은 열렸을 때의 스냅샷이라 연동 상태 변경이 즉시 반영되지 않으므로
      // 모달을 닫아 목록의 최신 상태(뱃지/동기화 버튼)를 보여준다.
      onLinked();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mt-1">
      <label className="block mb-1.5 font-medium text-sm text-gray-700 dark:text-gray-300">growlio 계좌 연동</label>
      {growlioAccountId ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-gray-500 dark:text-gray-400 truncate">연동됨 ({growlioAccountId.slice(0, 8)}…)</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Unlink size={14} />}
            loading={linkMutation.isPending}
            onClick={() => linkMutation.mutate(null)}
          >
            연동 해제
          </Button>
        </div>
      ) : pickerOpen ? (
        <div className="space-y-2">
          {isLoading && <p className="text-xs text-gray-400">growlio 계좌를 불러오는 중…</p>}
          {isError && (
            <p className="text-xs text-red-500">{extractErrorMessage(error, "growlio 계좌를 불러오지 못했습니다.")}</p>
          )}
          {rows && rows.length === 0 && <p className="text-xs text-gray-400">연동할 수 있는 growlio 계좌가 없어요.</p>}
          {rows?.map((row) => (
            <button
              key={getRowId(row)}
              type="button"
              onClick={() => linkMutation.mutate(getRowId(row))}
              disabled={linkMutation.isPending}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors disabled:opacity-50"
            >
              <span className="truncate">{getRowLabel(row)}</span>
              <span className="shrink-0 text-gray-500 dark:text-gray-400">{formatKrw(getRowAmount(row))}</span>
            </button>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setPickerOpen(false)}>
            취소
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" size="sm" icon={<Link2 size={14} />} onClick={() => setPickerOpen(true)}>
          growlio 계좌 선택
        </Button>
      )}
    </div>
  );
}
