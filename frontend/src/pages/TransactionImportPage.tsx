import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import { importTransactionsCsv } from "@/api/transactions";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { extractErrorMessage } from "@/utils/error";
import { TOUCH_TARGET_ROW } from "@/constants/uiSizes";
import type { ImportResultOut } from "@/types";

export default function TransactionImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResultOut | null>(null);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: (f: File) => importTransactionsCsv(f),
    onSuccess: (data) => {
      setResult(data);
      setError("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.transactionsAll });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
    },
    onError: (err) => setError(extractErrorMessage(err)),
  });

  return (
    <div className="max-w-md space-y-4">
      <Link
        to="/transactions"
        className={`gap-2 -ml-1 px-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 ${TOUCH_TARGET_ROW} w-auto inline-flex`}
      >
        <ArrowLeft size={18} />
        가계부
      </Link>
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">CSV 가져오기</h1>
      <div className="card space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          날짜, 구분, 카테고리, 금액, 메모 순서의 CSV 파일을 업로드하세요 (내보내기와 동일한 형식).
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-500 dark:text-gray-400"
        />
        <Button
          disabled={!file}
          loading={importMutation.isPending}
          onClick={() => file && importMutation.mutate(file)}
        >
          업로드
        </Button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {result && (
        <div className="card space-y-2">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
            {result.created}건 생성됨, {result.skipped.length}건 건너뜀
          </p>
          {result.skipped.length > 0 && (
            <ul className="text-xs text-red-500 space-y-1">
              {result.skipped.map((row, i) => (
                <li key={i}>
                  {row.line}행: {row.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
