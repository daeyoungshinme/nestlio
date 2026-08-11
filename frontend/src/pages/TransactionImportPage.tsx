import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import Tabs from "@/components/common/Tabs";
import { importTransactionsCsv, importTransactionsFromSheet } from "@/api/transactions";
import { fetchSettings } from "@/api/settings";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { extractErrorMessage } from "@/utils/error";
import { TOUCH_TARGET_ROW } from "@/constants/uiSizes";
import type { ImportResultOut, SheetImportIn } from "@/types";

const SOURCE_TABS = ["CSV 파일", "구글 시트"] as const;
type SourceTab = (typeof SOURCE_TABS)[number];

const SHEET_MODE_TABS = ["공개 링크", "구글 계정 연동"] as const;
type SheetModeTab = (typeof SHEET_MODE_TABS)[number];

function ImportResultCard({ result }: { result: ImportResultOut }) {
  return (
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
  );
}

export default function TransactionImportPage() {
  const [sourceTab, setSourceTab] = useState<SourceTab>("CSV 파일");
  const [sheetModeTab, setSheetModeTab] = useState<SheetModeTab>("공개 링크");
  const [file, setFile] = useState<File | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [result, setResult] = useState<ImportResultOut | null>(null);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({ queryKey: QUERY_KEYS.settings, queryFn: fetchSettings });

  const onImportSuccess = (data: ImportResultOut) => {
    setResult(data);
    setError("");
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.transactionsAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
  };
  const onImportError = (err: unknown) => setError(extractErrorMessage(err));

  const csvMutation = useMutation({
    mutationFn: (f: File) => importTransactionsCsv(f),
    onSuccess: onImportSuccess,
    onError: onImportError,
  });

  const sheetMutation = useMutation({
    mutationFn: (payload: SheetImportIn) => importTransactionsFromSheet(payload),
    onSuccess: onImportSuccess,
    onError: onImportError,
  });

  const handleSheetSubmit = () => {
    if (sheetModeTab === "공개 링크") {
      sheetMutation.mutate({ mode: "public", sheet_url: sheetUrl });
    } else {
      sheetMutation.mutate({ mode: "oauth", spreadsheet_id: spreadsheetId, sheet_name: sheetName || undefined });
    }
  };

  return (
    <div className="max-w-md space-y-4">
      <Link
        to="/transactions"
        className={`gap-2 -ml-1 px-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 ${TOUCH_TARGET_ROW} w-auto inline-flex`}
      >
        <ArrowLeft size={18} />
        가계부
      </Link>
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">거래 가져오기</h1>

      <Tabs
        tabs={SOURCE_TABS}
        activeTab={sourceTab}
        onChange={(tab) => {
          setSourceTab(tab);
          setResult(null);
          setError("");
        }}
        variant="pill"
        fullWidth
      />

      {sourceTab === "CSV 파일" && (
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
      )}

      {sourceTab === "구글 시트" && (
        <div className="space-y-3">
          <Tabs
            tabs={SHEET_MODE_TABS}
            activeTab={sheetModeTab}
            onChange={(tab) => {
              setSheetModeTab(tab);
              setResult(null);
              setError("");
            }}
            variant="pill"
            fullWidth
          />

          {sheetModeTab === "공개 링크" && (
            <div className="card space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                날짜, 구분, 카테고리, 금액, 메모 순서로 정리된 시트를 '링크가 있는 모든 사용자'로
                공유한 뒤 링크를 붙여넣으세요.
              </p>
              <FormInput
                label="시트 링크"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
              />
              <Button
                disabled={!sheetUrl}
                loading={sheetMutation.isPending}
                onClick={handleSheetSubmit}
              >
                가져오기
              </Button>
            </div>
          )}

          {sheetModeTab === "구글 계정 연동" && (
            <div className="card space-y-3">
              {settings && !settings.google_connected ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  구글 계정이 아직 연동되어 있지 않습니다. 설정 페이지의 연동 안내를 참고하세요.
                </p>
              ) : (
                <>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    연동된 구글 계정으로 비공개 시트도 가져올 수 있어요. 탭 이름을 비우면 첫 번째
                    탭을 읽습니다.
                  </p>
                  <FormInput
                    label="스프레드시트 ID 또는 URL"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={spreadsheetId}
                    onChange={(e) => setSpreadsheetId(e.target.value)}
                  />
                  <FormInput
                    label="탭 이름 (선택)"
                    placeholder="예: 2026년 1월"
                    value={sheetName}
                    onChange={(e) => setSheetName(e.target.value)}
                  />
                  <Button
                    disabled={!spreadsheetId}
                    loading={sheetMutation.isPending}
                    onClick={handleSheetSubmit}
                  >
                    가져오기
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {result && <ImportResultCard result={result} />}
    </div>
  );
}
