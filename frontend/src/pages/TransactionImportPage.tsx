import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import { bulkDeleteTransactions, fetchTransactionsCsv, importTransactionsCsv } from "@/api/transactions";
import { useInvalidateTransactionRelated } from "@/hooks/useInvalidateTransactionRelated";
import { currentYear, currentYearMonth, monthBounds } from "@/utils/date";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import { triggerBlobDownload } from "@/utils/download";
import { TOUCH_TARGET_MIN_HEIGHT, TOUCH_TARGET_ROW } from "@/constants/uiSizes";
import type { ImportResultOut } from "@/types";
import { ROUTES } from "@/constants/routes";
import { errorMessageTextClass } from "@/utils/colors";

function ImportResultCard({ result, onUndo }: { result: ImportResultOut; onUndo?: () => void }) {
  return (
    <div className="card space-y-2">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
        {result.created}건 생성됨, {result.skipped.length}건 건너뜀
      </p>
      {result.skipped.length > 0 && (
        <ul className={`text-xs ${errorMessageTextClass()} space-y-1`}>
          {result.skipped.map((row, i) => (
            <li key={i}>
              {row.line}행: {row.reason}
            </li>
          ))}
        </ul>
      )}
      {onUndo && result.created_ids.length > 0 && (
        <button
          type="button"
          onClick={onUndo}
          className={`inline-flex items-center ${TOUCH_TARGET_MIN_HEIGHT} text-xs ${errorMessageTextClass()} hover:underline`}
        >
          방금 가져온 {result.created_ids.length}건 되돌리기
        </button>
      )}
    </div>
  );
}

export default function TransactionImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResultOut | null>(null);
  const [error, setError] = useState("");
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const invalidateTransactionRelated = useInvalidateTransactionRelated();

  const onImportSuccess = (data: ImportResultOut) => {
    setResult(data);
    setError("");
    invalidateTransactionRelated();
  };
  const onImportError = (err: unknown) => setError(extractErrorMessage(err));

  const undoMutation = useMutation({
    mutationFn: (ids: number[]) => bulkDeleteTransactions(ids),
    onSuccess: (res) => {
      setShowUndoConfirm(false);
      setResult(null);
      invalidateTransactionRelated();
      toast(`${res.deleted}건 되돌렸습니다.`, "success");
      if (res.failed.length > 0) {
        toast(`${res.failed.length}건은 이미 삭제되어 건너뛰었습니다.`, "error");
      }
    },
    onError: (err) => {
      setShowUndoConfirm(false);
      toast(extractErrorMessage(err), "error");
    },
  });

  const csvMutation = useMutation({
    mutationFn: (f: File) => importTransactionsCsv(f),
    onSuccess: onImportSuccess,
    onError: onImportError,
  });

  const exportMutation = useMutation({
    mutationFn: ({ date_from, date_to }: { date_from: string; date_to: string }) =>
      fetchTransactionsCsv({ date_from, date_to }),
    onSuccess: (blob, { date_from, date_to }) =>
      triggerBlobDownload(blob, `transactions_${date_from}_${date_to}.csv`),
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const exportRange = (kind: "month" | "year") => {
    if (kind === "month") {
      exportMutation.mutate(monthBounds(currentYearMonth()));
    } else {
      const y = currentYear();
      exportMutation.mutate({ date_from: `${y}-01-01`, date_to: `${y}-12-31` });
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <Link
        to={ROUTES.transactions}
        className={`gap-2 -ml-1 px-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 ${TOUCH_TARGET_ROW} w-auto inline-flex`}
      >
        <ArrowLeft size={18} />
        가계부
      </Link>

      <div className="card space-y-3">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-50">CSV 내보내기</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          날짜, 구분, 카테고리, 금액, 메모 순서로 내려받아요 (가져오기와 동일한 형식).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={exportMutation.isPending}
            onClick={() => exportRange("month")}
          >
            이번 달 내보내기
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={exportMutation.isPending}
            onClick={() => exportRange("year")}
          >
            올해 전체 내보내기
          </Button>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 pt-2">거래 가져오기</h2>

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
          loading={csvMutation.isPending}
          onClick={() => file && csvMutation.mutate(file)}
        >
          업로드
        </Button>
      </div>

      {error && <p className={`text-sm ${errorMessageTextClass()}`}>{error}</p>}
      {result && <ImportResultCard result={result} onUndo={() => setShowUndoConfirm(true)} />}

      {showUndoConfirm && result && (
        <ConfirmModal
          message={`방금 가져온 ${result.created_ids.length}건을 모두 삭제할까요? 되돌릴 수 없습니다.`}
          confirmLabel="되돌리기"
          onConfirm={() => undoMutation.mutate(result.created_ids)}
          onCancel={() => setShowUndoConfirm(false)}
        />
      )}
    </div>
  );
}
