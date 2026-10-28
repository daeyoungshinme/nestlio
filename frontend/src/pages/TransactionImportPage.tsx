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
import { formatKrw } from "@/utils/format";
import { TOUCH_TARGET_MIN_HEIGHT, TOUCH_TARGET_ROW } from "@/constants/uiSizes";
import type { AutoCategorySource, ImportResultOut } from "@/types";
import { useCategories } from "@/hooks/useReferenceData";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { ROUTES } from "@/constants/routes";
import { cautionTextClass, errorMessageTextClass } from "@/utils/colors";

/** 건너뛴 행 목록은 이만큼만 — 형식이 틀린 CSV면 수백 줄이 화면을 덮는다. */
const SKIPPED_ROWS_LIMIT = 20;

const AUTO_CATEGORY_SOURCE_LABELS: Record<AutoCategorySource, string> = {
  history: "이전 거래",
  keyword: "가맹점",
  fallback: "기본값",
};

export function ImportResultCard({ result, onUndo }: { result: ImportResultOut; onUndo?: () => void }) {
  const shownSkipped = result.skipped.slice(0, SKIPPED_ROWS_LIMIT);
  const hiddenSkipped = result.skipped.length - shownSkipped.length;
  const autoCategorized = result.auto_categorized;
  const shownAuto = autoCategorized.slice(0, SKIPPED_ROWS_LIMIT);
  const hiddenAuto = autoCategorized.length - shownAuto.length;
  const shownMerged = result.merged.slice(0, SKIPPED_ROWS_LIMIT);
  const hiddenMerged = result.merged.length - shownMerged.length;
  return (
    <div className="card space-y-2">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-50">
        {result.created}건 생성됨, {result.skipped.length}건 건너뜀
      </p>
      {autoCategorized.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {autoCategorized.length}건은 메모를 보고 카테고리를 자동으로 정했어요
          </p>
          <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            {shownAuto.map((row) => (
              <li key={row.line}>
                {row.line}행 {row.description} → {row.category_name} ({AUTO_CATEGORY_SOURCE_LABELS[row.source]})
              </li>
            ))}
            {hiddenAuto > 0 && <li>외 {hiddenAuto}건</li>}
          </ul>
        </div>
      )}
      {result.unmatched_accounts.length > 0 && (
        <p className={`text-xs ${cautionTextClass()}`}>
          등록되지 않은 계좌라 계좌 없이 넣었어요: {result.unmatched_accounts.join(", ")}
        </p>
      )}
      {result.merged.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            같은 날 비슷한 메모 {result.merged.length}묶음은 금액을 합쳐 한 건으로 만들었어요
          </p>
          <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            {shownMerged.map((group) => (
              <li key={group.lines[0]}>
                {group.lines.join("·")}행 {group.description} → {formatKrw(group.amount)}
              </li>
            ))}
            {hiddenMerged > 0 && <li>외 {hiddenMerged}묶음</li>}
          </ul>
        </div>
      )}
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
  const fallbackSelectId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [fallbackCategoryId, setFallbackCategoryId] = useState<number | undefined>(undefined);
  const { data: expenseCategories = [] } = useCategories("expense");
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
    mutationFn: (f: File) => importTransactionsCsv(f, fallbackCategoryId),
    onSuccess: onImportSuccess,
    onError: onImportError,
  });

  const exportMutation = useMutation({
    mutationFn: ({ date_from, date_to }: { date_from: string; date_to: string }) =>
      fetchTransactionsCsv({ date_from, date_to }),
    onSuccess: (blob, { date_from, date_to }) =>
      triggerBlobDownload(blob, `transactions_${date_from}_${date_to}.csv`),
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
          날짜, 구분, 카테고리, 금액, 메모, 입력자, 계좌, 결제수단 순서로 내려받아요 (가져오기와 동일한 형식).
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
        <p className="text-sm text-gray-500 dark:text-gray-400">
          내보내기와 같은 형식의 CSV 파일을 올리세요. 첫 줄에 헤더가 있으면 칸 순서는 달라도 돼요. 계좌는 등록된 계좌 이름으로, 결제수단은 현금·신용카드·체크카드·계좌이체로 맞춰요. 카테고리 칸을 비워 두면 메모를 보고 이전 거래와 같은
          카테고리로 채우고, 처음 보는 메모는 가맹점 이름(스타벅스·이마트 등)으로 짐작해요. 같은 날 비슷한 메모는 한 건으로 합치고, 이미 있는 거래는 건너뛰어요.
        </p>
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
        <div>
          <label htmlFor={fallbackSelectId} className={`block mb-1 font-medium ${LABEL_SM}`}>
            메모로도 못 찾은 지출은
          </label>
          <select
            id={fallbackSelectId}
            className={`${INPUT_SM} w-full`}
            value={fallbackCategoryId ?? ""}
            onChange={(e) => setFallbackCategoryId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">건너뛰기</option>
            {expenseCategories
              .filter((c) => c.is_active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}(으)로 넣기
                </option>
              ))}
          </select>
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
