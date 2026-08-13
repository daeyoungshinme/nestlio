import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import Modal from "@/components/common/Modal";
import StatusBadge from "@/components/common/StatusBadge";
import { formatKrw } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";

interface RowMeta {
  name: string;
  badge: string;
  subtext?: ReactNode;
  amountNote?: ReactNode;
}

interface Props<TRow, TResult> {
  title: string;
  queryKey: QueryKey;
  fetchRows: () => Promise<TRow[]>;
  getRowId: (row: TRow) => string;
  getRowAmount: (row: TRow) => number;
  renderRowMeta: (row: TRow) => RowMeta;
  existingGrowlioAccountIds: Set<string>;
  importRows: (payload: { growlio_account_ids: string[] }) => Promise<TResult[]>;
  buildSuccessMessage: (results: TResult[]) => string;
  invalidateKeys: QueryKey[];
  onClose: () => void;
}

/** 계좌/저축·투자/부동산 탭이 공유하는 growlio 계좌 일괄 가져오기 모달. 이미 연동된 계좌는 목록에서
 * 제외하고, 체크박스로 선택한 계좌들을 한 번에 가져온다 ('전체 선택'). 행 타입(TRow)과 가져오기 결과
 * 타입(TResult)은 탭마다 다르므로(계좌/투자는 단일 금액, 부동산은 시세+담보대출 페어) 행 표시
 * (`renderRowMeta`)와 성공 메시지 조립(`buildSuccessMessage`)을 호출부로 위임한다. */
export default function GrowlioImportModal<TRow, TResult>({
  title,
  queryKey,
  fetchRows,
  getRowId,
  getRowAmount,
  renderRowMeta,
  existingGrowlioAccountIds,
  importRows,
  buildSuccessMessage,
  invalidateKeys,
  onClose,
}: Props<TRow, TResult>) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: rows, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: fetchRows,
    retry: false,
  });

  const importable = (rows ?? []).filter((row) => !existingGrowlioAccountIds.has(getRowId(row)));
  const allSelected = importable.length > 0 && selected.size === importable.length;
  const selectedTotal = importable
    .filter((row) => selected.has(getRowId(row)))
    .reduce((sum, row) => sum + getRowAmount(row), 0);

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(importable.map((row) => getRowId(row))));
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
    mutationFn: () => importRows({ growlio_account_ids: [...selected] }),
    onSuccess: (results) => {
      for (const key of invalidateKeys) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      toast(buildSuccessMessage(results), "success");
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
        {rows && importable.length === 0 && (
          <p className="text-xs text-gray-400">가져올 수 있는 growlio 계좌가 없어요.</p>
        )}
        {importable.length > 0 && (
          <>
            <label className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded" />
              전체 선택 ({importable.length}개)
            </label>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {importable.map((row) => {
                const id = getRowId(row);
                const meta = renderRowMeta(row);
                return (
                  <label
                    key={id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggleOne(id)}
                        className="rounded shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{meta.name}</span>
                          <StatusBadge
                            size="chip"
                            label={meta.badge}
                            toneClassName="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                            className="shrink-0"
                          />
                        </span>
                        {meta.subtext && (
                          <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate">
                            {meta.subtext}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-gray-500 dark:text-gray-400">
                      <span className="block">{formatKrw(getRowAmount(row))}</span>
                      {meta.amountNote}
                    </span>
                  </label>
                );
              })}
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
