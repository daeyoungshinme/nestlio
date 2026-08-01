import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Mail, Moon, Sun, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import Button from "@/components/common/Button";
import SkeletonCard from "@/components/common/SkeletonCard";
import { useLogout } from "@/hooks/useLogout";
import { useThemeStore } from "@/stores/themeStore";
import { deleteCouplePhoto, fetchSettings, testMonthlyEmail, testWeeklyEmail, uploadCouplePhoto } from "@/api/settings";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { formatPercent } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";

export default function SettingsPage() {
  const [couplePhotoFile, setCouplePhotoFile] = useState<File | null>(null);
  const queryClient = useQueryClient();
  const logout = useLogout();
  const { isDark, toggle: toggleTheme } = useThemeStore();

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.settings, queryFn: fetchSettings });

  const uploadPhotoMutation = useMutation({
    mutationFn: uploadCouplePhoto,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setCouplePhotoFile(null);
      toast("부부 사진이 저장되었습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: deleteCouplePhoto,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast("부부 사진을 삭제했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const weeklyEmailMutation = useMutation({
    mutationFn: testWeeklyEmail,
    onSuccess: (res) => toast(res.message, res.sent ? "success" : "info"),
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const monthlyEmailMutation = useMutation({
    mutationFn: testMonthlyEmail,
    onSuccess: (res) => toast(res.message, res.sent ? "success" : "info"),
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (isLoading || !data) {
    return <SkeletonCard rows={4} />;
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">설정</h1>

      <div className="card space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">화면 테마</h3>
        <button
          onClick={toggleTheme}
          aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
          className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="flex items-center gap-3">
            {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            {isDark ? "라이트 모드" : "다크 모드"}
          </span>
        </button>
      </div>

      <div className="card space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">부부 사진</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">대시보드 상단에 배너로 표시됩니다.</p>
        {data.couple_photo_url && (
          <img
            src={data.couple_photo_url}
            alt="부부 사진"
            className="w-full h-32 object-cover rounded-lg"
          />
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setCouplePhotoFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-500 dark:text-gray-400"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!couplePhotoFile}
            loading={uploadPhotoMutation.isPending}
            onClick={() => couplePhotoFile && uploadPhotoMutation.mutate(couplePhotoFile)}
          >
            업로드
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data.couple_photo_url}
            loading={deletePhotoMutation.isPending}
            onClick={() => deletePhotoMutation.mutate()}
          >
            삭제
          </Button>
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Google 연동</h3>
        <div className="flex items-center gap-2 text-sm">
          {data.google_connected ? (
            <>
              <CheckCircle2 size={16} className="text-emerald-600" />
              <span className="text-gray-700 dark:text-gray-300">연결됨</span>
            </>
          ) : (
            <>
              <XCircle size={16} className="text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400">연결되지 않음 (scripts/google_auth_setup.py 실행 필요)</span>
            </>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">알림 수신 이메일: {data.notify_email_to}</p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={<Mail size={14} />}
            loading={weeklyEmailMutation.isPending}
            onClick={() => weeklyEmailMutation.mutate()}
          >
            주간 요약 테스트
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Mail size={14} />}
            loading={monthlyEmailMutation.isPending}
            onClick={() => monthlyEmailMutation.mutate()}
          >
            월간 요약 테스트
          </Button>
        </div>
      </div>

      <div className="card space-y-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">예산 임계값</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          경고 {formatPercent(data.budget_warn_pct)} · 위험 {formatPercent(data.budget_critical_pct)}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">서버 환경변수(BUDGET_WARN_PCT 등)로 조정합니다.</p>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
        비상금은{" "}
        <Link to="/financial-plan?tab=재무목표" className="text-blue-600 dark:text-blue-400 hover:underline">
          목표 탭
        </Link>
        에서 관리해요.
      </p>

      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
        <Link to="/categories" className="text-blue-600 dark:text-blue-400 hover:underline">
          카테고리 관리
        </Link>
        에서 고정·변동·비정기지출 카테고리를 추가/수정할 수 있어요.
      </p>

      <Button variant="secondary" onClick={() => void logout()}>
        로그아웃
      </Button>
    </div>
  );
}
