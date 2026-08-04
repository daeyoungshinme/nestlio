import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Copy, Mail, Moon, Sun, UserPlus, X, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import SkeletonCard from "@/components/common/SkeletonCard";
import { useLogout } from "@/hooks/useLogout";
import { useThemeStore } from "@/stores/themeStore";
import {
  deleteCouplePhoto,
  fetchSettings,
  setCoachingThresholds,
  testMonthlyEmail,
  testWeeklyEmail,
  uploadCouplePhoto,
} from "@/api/settings";
import { cancelInvite, createInvite, fetchInvites } from "@/api/invites";
import { fetchUsers } from "@/api/users";
import type { CoachingThresholdsOut, InviteOut } from "@/types";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { INPUT_SM } from "@/constants/inputStyles";
import { extractErrorMessage } from "@/utils/error";
import { inviteStatusLabel, inviteStatusTextClass } from "@/utils/colors";
import type { InviteStatus } from "@/utils/colors";
import { toast } from "@/utils/toast";

const THRESHOLD_FIELDS: { key: keyof CoachingThresholdsOut; label: string }[] = [
  { key: "savings_rate_warn", label: "저축률 경고" },
  { key: "savings_rate_critical", label: "저축률 위험" },
  { key: "fixed_cost_ratio_warn", label: "고정비율 경고" },
  { key: "fixed_cost_ratio_critical", label: "고정비율 위험" },
  { key: "budget_warn_pct", label: "예산 경고" },
  { key: "budget_critical_pct", label: "예산 위험" },
  { key: "discretionary_ratio_warn", label: "재량지출 경고" },
  { key: "debt_ratio_warn", label: "부채비율 경고" },
];

function inviteStatus(invite: InviteOut): InviteStatus {
  if (invite.accepted_at) return "accepted";
  if (new Date(invite.expires_at) < new Date()) return "expired";
  return "pending";
}

export default function SettingsPage() {
  const [couplePhotoFile, setCouplePhotoFile] = useState<File | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [thresholdEdits, setThresholdEdits] = useState<Partial<CoachingThresholdsOut>>({});
  const [thresholdsOpen, setThresholdsOpen] = useState(false);
  const queryClient = useQueryClient();
  const logout = useLogout();
  const { isDark, toggle: toggleTheme } = useThemeStore();

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.settings, queryFn: fetchSettings });
  const usersQuery = useQuery({ queryKey: QUERY_KEYS.users, queryFn: fetchUsers });
  const invitesQuery = useQuery({ queryKey: QUERY_KEYS.invites, queryFn: fetchInvites });

  const uploadPhotoMutation = useMutation({
    mutationFn: uploadCouplePhoto,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      setCouplePhotoFile(null);
      toast("부부 사진이 저장되었습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: deleteCouplePhoto,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
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

  const thresholdsMutation = useMutation({
    mutationFn: setCoachingThresholds,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      setThresholdEdits({});
      toast("코칭 임계값을 저장했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const createInviteMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.invites });
      setInviteEmail("");
      toast("배우자에게 초대를 보냈습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: cancelInvite,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.invites });
      toast("초대를 취소했습니다.", "success");
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const copyAcceptUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast("초대 링크를 복사했습니다.", "success");
    } catch {
      toast("링크 복사에 실패했습니다.", "error");
    }
  };

  const householdFull = (usersQuery.data?.length ?? 0) >= 2;

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
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">배우자 초대</h3>
        {householdFull ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">이미 배우자가 등록되어 있어요.</p>
        ) : (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              이메일로 초대를 보내면, 배우자가 링크를 눌러 직접 계정을 만들 수 있어요.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="spouse@example.com"
                className={`flex-1 ${INPUT_SM}`}
              />
              <Button
                size="sm"
                icon={<UserPlus size={14} />}
                disabled={!inviteEmail}
                loading={createInviteMutation.isPending}
                onClick={() => createInviteMutation.mutate(inviteEmail)}
              >
                초대
              </Button>
            </div>
          </>
        )}

        {!!invitesQuery.data?.length && (
          <ul className="space-y-2">
            {invitesQuery.data.map((invite) => {
              const status = inviteStatus(invite);
              return (
                <li
                  key={invite.id}
                  className="flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div className="min-w-0">
                    <p className="text-gray-700 dark:text-gray-300 truncate">{invite.email}</p>
                    <p className={`text-xs ${inviteStatusTextClass(status)}`}>{inviteStatusLabel(status)}</p>
                  </div>
                  {status === "pending" && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="초대 링크 복사"
                        onClick={() => void copyAcceptUrl(invite.accept_url)}
                      >
                        <Copy size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="초대 취소"
                        loading={cancelInviteMutation.isPending}
                        onClick={() => cancelInviteMutation.mutate(invite.id)}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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

      <div className="card space-y-3">
        <button
          type="button"
          onClick={() => setThresholdsOpen((prev) => !prev)}
          aria-expanded={thresholdsOpen}
          className="w-full flex items-center justify-between gap-2 min-h-[44px]"
        >
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">고급: 코칭 기준값</span>
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform duration-200 ${thresholdsOpen ? "rotate-180" : ""}`}
          />
        </button>
        {thresholdsOpen && (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              대시보드 코칭 인사이트가 발동하는 기준(%)이에요. 두 분의 소비 성향에 맞게 조정할 수 있어요.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {THRESHOLD_FIELDS.map(({ key, label }) => (
                <FormInput
                  key={key}
                  label={label}
                  type="number"
                  min={0}
                  max={999}
                  step={1}
                  value={thresholdEdits[key] ?? data.coaching_thresholds[key]}
                  onChange={(e) =>
                    setThresholdEdits((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                  }
                />
              ))}
            </div>
            <Button
              size="sm"
              disabled={Object.keys(thresholdEdits).length === 0}
              loading={thresholdsMutation.isPending}
              onClick={() =>
                thresholdsMutation.mutate({ ...data.coaching_thresholds, ...thresholdEdits })
              }
            >
              저장
            </Button>
          </>
        )}
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
