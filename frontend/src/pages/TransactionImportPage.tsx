import { useId, useState } from "react";
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

/** 건너뛴 행 목록은 이만큼만 — 형식이 틀린 CSV면 수백 줄이 화면을 덮는다. */
const SKIPPED_ROWS_LIMIT = 20;

export function ImportResultCard({ result, onUndo }: { result: ImportResultOut; onUndo?: () => void }) {
  const shownSkipped = result.skipped.slice(0, SKIPPED_ROWS_LIMIT);
  const hiddenSkipped = result.skipped.length - shownSkipped.length;
  return (
    <div className="card space-y-2">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
        {result.created}건 생성됨, {result.skipped.length}건 건너뜀
      </p>
      {result.skipped.length > 0 && (
        <ul className={`text-xs ${errorMessageTextClass()} space-y-1`}>
          {shownSkipped.map((row, i) => (
            <li key={i}>
              {row.line}행: {row.reason}
            </li>
          ))}
          {hiddenSkipped > 0 && <li>외 {hiddenSkipped}건</li>}
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
  const fileInputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [exportingKind, setExportingKind] = useState<"month" | "year" | null>(null);
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
    onSettled: () => setExportingKind(null),
  });

  const exportRange = (kind: "month" | "year") => {
    setExportingKind(kind);
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
            loading={exportingKind === "month"}
            onClick={() => exportRange("month")}
          >
            이번 달 내보내기
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={exportMutation.isPending}
            loading={exportingKind === "year"}
            onClick={() => exportRange("year")}
          >
            올해 전체 내보내기
          </Button>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 pt-2">거래 가져오기</h2>

      <div className="card space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">내보내기와 같은 형식의 CSV 파일을 올리세요.</p>
        {/* 브라우저 기본 파일 입력은 버튼이 작고 화면마다 모양이 달라 label 버튼으로 감싼다(부부 사진과 같은 방식). */}
        <div className="flex items-center gap-3">
          <label
            htmlFor={fileInputId}
            className={`${TOUCH_TARGET_MIN_HEIGHT} inline-flex items-center px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors shrink-0`}
          >
            파일 선택
          </label>
          <input
            id={fileInputId}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <span className="min-w-0 truncate text-sm text-gray-500 dark:text-gray-400">
            {file ? file.name : "선택된 파일 없음"}
          </span>
        </div>
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
