import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";
import { formatKrw } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { GrowlioAccountOut } from "@/types";

/** 저축·투자 탭/계좌 탭이 공유하는 growlio 계좌 일괄 가져오기 모달. 이미 연동된 계좌는 목록에서
 * 제외하고, 체크박스로 선택한 계좌들을 한 번에 가져온다 ('전체 선택'). 가져온 결과의 타입은
 * 호출부(저축상품/계좌)마다 다르므로 총액 계산은 `getAmount`로 위임한다. */
export default function GrowlioImportModal<T>({
  title,
  queryKey,
  fetchAccounts,
  importAccounts,
  existingGrowlioAccountIds,
  invalidateKeys,
  getAmount,
  onClose,
}: {
  title: string;
  queryKey: QueryKey;
  fetchAccounts: () => Promise<GrowlioAccountOut[]>;
  importAccounts: (payload: { growlio_account_ids: string[] }) => Promise<T[]>;
  existingGrowlioAccountIds: Set<string>;
  invalidateKeys: QueryKey[];
  getAmount: (item: T) => number | string;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: growlioAccounts, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: fetchAccounts,
    retry: false,
  });

  const importable = (growlioAccounts ?? []).filter((account) => !existingGrowlioAccountIds.has(account.id));
  const allSelected = importable.length > 0 && selected.size === importable.length;
  const selectedTotal = importable
    .filter((account) => selected.has(account.id))
    .reduce((sum, account) => sum + account.current_value_krw, 0);

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(importable.map((account) => account.id)));
  };

  const toggleOne = (accountId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  const importMutation = useMutation({
    mutationFn: () => importAccounts({ growlio_account_ids: [...selected] }),
    onSuccess: (created) => {
      for (const key of invalidateKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      const total = created.reduce((sum, item) => sum + Number(getAmount(item)), 0);
      toast(`growlio 계좌 ${created.length}개를 가져왔습니다. 합계 ${formatKrw(total)}`, "success");
      onClose();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  return (
    <Modal onClose={onClose} title={title}>
      <div className="p-6 overflow-y-auto flex flex-col gap-3">
        {isLoading && <p className="text-xs text-gray-400">growlio 계좌를 불러오는 중…</p>}
        {isError && (
          <p className="text-xs text-red-500">{extractErrorMessage(error, "growlio 계좌를 불러오지 못했습니다.")}</p>
        )}
        {growlioAccounts && importable.length === 0 && (
          <p className="text-xs text-gray-400">가져올 수 있는 growlio 계좌가 없어요.</p>
        )}
        {importable.length > 0 && (
          <>
            <label className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
              전체 선택 ({importable.length}개)
            </label>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {importable.map((account) => (
                <label
                  key={account.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selected.has(account.id)}
                      onChange={() => toggleOne(account.id)}
                      className="rounded shrink-0"
                    />
                    <span className="truncate">{account.name}</span>
                  </span>
                  <span className="shrink-0 text-gray-500 dark:text-gray-400">{formatKrw(account.current_value_krw)}</span>
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
