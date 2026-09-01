import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Mail, Moon, Sun, UserMinus, UserPlus, X, XCircle } from "lucide-react";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import ConfirmModal from "@/components/common/ConfirmModal";
import FormInput from "@/components/common/FormInput";
import SkeletonCard from "@/components/common/SkeletonCard";
import ErrorState from "@/components/common/ErrorState";
import StatusBadge from "@/components/common/StatusBadge";
import { SettingsLinkRow, SettingsSectionCard } from "@/components/settings/shared";
import { useLogout } from "@/hooks/useLogout";
import { useThemeStore } from "@/stores/themeStore";
import {
  deleteCouplePhoto,
  fetchSettings,
  setCoachingThresholds,
  setNotificationPrefs,
  setNotifyEmails,
  testMonthlyEmail,
  testWeeklyEmail,
  uploadCouplePhoto,
} from "@/api/settings";
import { cancelInvite, createInvite, fetchInvites } from "@/api/invites";
import { removeUser, updateMe, updateUser } from "@/api/users";
import type { CoachingThresholdsOut, InviteOut, NotificationPrefsOut } from "@/types";
import { useMe, useUsers } from "@/hooks/useReferenceData";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { COACHING_THRESHOLD_PRESETS } from "@/constants/coachingPresets";
import { MAX_NOTIFY_RECIPIENTS } from "@/constants/settings";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import { extractErrorMessage } from "@/utils/error";
import { connectionStatusBadgeClass, connectionStatusLabel, inviteStatusLabel, inviteStatusTextClass } from "@/utils/colors";
import type { InviteStatus } from "@/utils/colors";
import { toast } from "@/utils/toast";

const NOTIF_PREF_FIELDS: { key: keyof NotificationPrefsOut; label: string; hint: string }[] = [
  { key: "email_weekly", label: "주간 요약", hint: "매주 가계부 요약 이메일" },
  { key: "email_monthly", label: "월간 요약", hint: "매달 가계부 요약 + 코칭 인사이트 이메일" },
  { key: "threshold_alert", label: "예산 초과 경고", hint: "카테고리 예산이 주의/위험 기준을 넘으면 알림" },
  { key: "goal_milestone", label: "목표 마일스톤 달성", hint: "재무목표가 25/50/75/100%에 도달하면 축하 알림" },
  { key: "challenge_success", label: "챌린지 성공", hint: "부부 챌린지를 달성하면 축하 알림" },
  { key: "event_reminder", label: "일정 알림", hint: "등록한 개인 일정·리마인더의 알림 시각이 되면 이메일" },
];

const THRESHOLD_FIELDS: { key: keyof CoachingThresholdsOut; label: string }[] = [
  { key: "savings_rate_warn", label: "저축률 경고" },
  { key: "savings_rate_critical", label: "저축률 위험" },
  { key: "fixed_cost_ratio_warn", label: "고정비율 경고" },
  { key: "fixed_cost_ratio_critical", label: "고정비율 위험" },
  { key: "budget_warn_pct", label: "예산 경고" },
  { key: "budget_critical_pct", label: "예산 위험" },
  { key: "discretionary_ratio_warn", label: "재량지출 경고" },
  { key: "debt_ratio_warn", label: "부채비율 경고" },
  { key: "benchmark_food_warn_pct", label: "식비 가이드라인" },
  { key: "benchmark_housing_warn_pct", label: "주거/공과금 가이드라인" },
  { key: "benchmark_communication_warn_pct", label: "통신비 가이드라인" },
  { key: "benchmark_transport_warn_pct", label: "교통비 가이드라인" },
  { key: "benchmark_leisure_warn_pct", label: "여가/문화 가이드라인" },
  { key: "benchmark_healthcare_warn_pct", label: "의료/건강 가이드라인" },
  { key: "benchmark_education_warn_pct", label: "교육 가이드라인" },
  { key: "benchmark_insurance_warn_pct", label: "보험 가이드라인" },
];

const onMutationError = (err: unknown) => toast(extractErrorMessage(err), "error");

function inviteStatus(invite: InviteOut): InviteStatus {
  if (invite.accepted_at) return "accepted";
  if (new Date(invite.expires_at) < new Date()) return "expired";
  return "pending";
}

export default function SettingsPage() {
  const [couplePhotoFile, setCouplePhotoFile] = useState<File | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [thresholdEdits, setThresholdEdits] = useState<Partial<CoachingThresholdsOut>>({});
  const [displayNameEdit, setDisplayNameEdit] = useState<string | null>(null);
  const [spouseDisplayNameEdit, setSpouseDisplayNameEdit] = useState<string | null>(null);
  const [newNotifyEmail, setNewNotifyEmail] = useState("");
  const [removeSpouseOpen, setRemoveSpouseOpen] = useState(false);
  const [removeSpouseConfirmText, setRemoveSpouseConfirmText] = useState("");
  const queryClient = useQueryClient();
  const logout = useLogout();
  const { isDark, toggle: toggleTheme } = useThemeStore();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({ queryKey: QUERY_KEYS.settings, queryFn: fetchSettings });
  const meQuery = useMe();
  const usersQuery = useUsers();
  const invitesQuery = useQuery({ queryKey: QUERY_KEYS.invites, queryFn: fetchInvites });
  const spouse = meQuery.data && usersQuery.data?.find((u) => u.id !== meQuery.data!.id);

  const uploadPhotoMutation = useMutation({
    mutationFn: uploadCouplePhoto,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      setCouplePhotoFile(null);
      toast("부부 사진이 저장되었습니다.", "success");
    },
    onError: onMutationError,
  });

  const deletePhotoMutation = useMutation({
    mutationFn: deleteCouplePhoto,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      toast("부부 사진을 삭제했습니다.", "success");
    },
    onError: onMutationError,
  });

  const updateDisplayNameMutation = useMutation({
    mutationFn: updateMe,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.me });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      setDisplayNameEdit(null);
      toast("표시 이름을 저장했습니다.", "success");
    },
    onError: onMutationError,
  });

  const updateSpouseDisplayNameMutation = useMutation({
    mutationFn: (display_name: string) => updateUser(spouse!.id, display_name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.monthlyRetrospective });
      setSpouseDisplayNameEdit(null);
      toast("배우자 표시 이름을 저장했습니다.", "success");
    },
    onError: onMutationError,
  });

  const removeSpouseMutation = useMutation({
    mutationFn: () => removeUser(spouse!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.me });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.monthlyRetrospective });
      setRemoveSpouseOpen(false);
      setRemoveSpouseConfirmText("");
      toast("배우자를 제거했습니다.", "success");
    },
    onError: onMutationError,
  });

  const weeklyEmailMutation = useMutation({
    mutationFn: testWeeklyEmail,
    onSuccess: (res) => toast(res.message, res.sent ? "success" : "info"),
    onError: onMutationError,
  });

  const monthlyEmailMutation = useMutation({
    mutationFn: testMonthlyEmail,
    onSuccess: (res) => toast(res.message, res.sent ? "success" : "info"),
    onError: onMutationError,
  });

  const thresholdsMutation = useMutation({
    mutationFn: setCoachingThresholds,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      setThresholdEdits({});
      toast("코칭 임계값을 저장했습니다.", "success");
    },
    onError: onMutationError,
  });

  const notifyEmailsMutation = useMutation({
    mutationFn: setNotifyEmails,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      setNewNotifyEmail("");
    },
    onError: onMutationError,
  });

  const notificationPrefsMutation = useMutation({
    mutationFn: setNotificationPrefs,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      toast("알림 설정을 저장했습니다.", "success");
    },
    onError: onMutationError,
  });

  const createInviteMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.invites });
      setInviteEmail("");
      if (res.email_sent) {
        toast("배우자에게 초대 메일을 보냈습니다.", "success");
      } else {
        toast("초대를 생성했지만 메일 발송에 실패했습니다. 아래 목록에서 링크를 복사해 직접 전달해주세요.", "info");
      }
    },
    onError: onMutationError,
  });

  const cancelInviteMutation = useMutation({
    mutationFn: cancelInvite,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.invites });
      toast("초대를 취소했습니다.", "success");
    },
    onError: onMutationError,
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

  if (isError) {
    return (
      <ErrorState
        message={extractErrorMessage(error, "설정 정보를 불러오지 못했습니다.")}
        onRetry={() => void refetch()}
      />
    );
  }

  if (isLoading || !data) {
    return (
      <div className="max-w-lg space-y-4">
        <SkeletonCard rows={3} />
        <SkeletonCard rows={4} />
        <SkeletonCard rows={2} />
        <SkeletonCard rows={3} />
        <SkeletonCard rows={3} />
      </div>
    );
  }

  const notifyEmails = data.notify_emails;
  const connectionStatus = data.google_connected ? "connected" : "disconnected";

  const pendingPrefKey = notificationPrefsMutation.isPending
    ? NOTIF_PREF_FIELDS.find(({ key }) => notificationPrefsMutation.variables?.[key] !== data.notification_prefs[key])?.key
    : undefined;

  const isRemovingEmail =
    notifyEmailsMutation.isPending &&
    !!notifyEmailsMutation.variables &&
    notifyEmailsMutation.variables.length < notifyEmails.length;
  const pendingRemovedEmail = isRemovingEmail
    ? notifyEmails.find((e) => !notifyEmailsMutation.variables!.includes(e))
    : undefined;
  const isAddingEmail = notifyEmailsMutation.isPending && !isRemovingEmail;

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-50">설정</h1>

      <SettingsSectionCard title="계정">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <FormInput
              label="내 표시 이름"
              value={displayNameEdit ?? meQuery.data?.display_name ?? ""}
              onChange={(e) => setDisplayNameEdit(e.target.value)}
              hint="남편, 아내처럼 원하는 별칭을 입력할 수 있어요. 목표 항목 구분, 대시보드 배우자별 합계 등에 표시돼요."
              maxLength={100}
            />
          </div>
          <Button
            size="sm"
            disabled={
              displayNameEdit === null ||
              displayNameEdit.trim() === "" ||
              displayNameEdit === meQuery.data?.display_name
            }
            loading={updateDisplayNameMutation.isPending}
            onClick={() => displayNameEdit && updateDisplayNameMutation.mutate(displayNameEdit.trim())}
          >
            저장
          </Button>
        </div>
        {spouse && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <FormInput
                label="배우자 표시 이름"
                value={spouseDisplayNameEdit ?? spouse.display_name}
                onChange={(e) => setSpouseDisplayNameEdit(e.target.value)}
                hint="배우자를 대신해 별칭을 정할 수 있어요. 배우자에게도 그대로 보여요."
                maxLength={100}
              />
            </div>
            <Button
              size="sm"
              disabled={
                spouseDisplayNameEdit === null ||
                spouseDisplayNameEdit.trim() === "" ||
                spouseDisplayNameEdit === spouse.display_name
              }
              loading={updateSpouseDisplayNameMutation.isPending}
              onClick={() =>
                spouseDisplayNameEdit && updateSpouseDisplayNameMutation.mutate(spouseDisplayNameEdit.trim())
              }
            >
              저장
            </Button>
          </div>
        )}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
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
      </SettingsSectionCard>

      <SettingsSectionCard title="가구·초대">
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">부부 사진 — 대시보드 상단에 배너로 표시됩니다.</p>
          {data.couple_photo_url && (
            <img
              src={data.couple_photo_url}
              alt="부부 사진"
              className="w-full h-32 object-cover rounded-lg"
            />
          )}
          <div className="flex items-center gap-3">
            <label
              htmlFor="couple-photo-input"
              className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors`}
            >
              파일 선택
            </label>
            <input
              id="couple-photo-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setCouplePhotoFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
            <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
              {couplePhotoFile ? couplePhotoFile.name : "선택된 파일 없음"}
            </span>
          </div>
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

        <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
          {householdFull ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">이미 배우자가 등록되어 있어요.</p>
              {spouse && (
                <Button
                  variant="danger"
                  size="sm"
                  icon={<UserMinus size={14} />}
                  onClick={() => setRemoveSpouseOpen(true)}
                >
                  배우자 제거
                </Button>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                이메일로 초대를 보내면, 배우자가 링크를 눌러 직접 계정을 만들 수 있어요.
              </p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <FormInput
                    label="배우자 이메일"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="spouse@example.com"
                  />
                </div>
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
                          disabled={cancelInviteMutation.isPending && cancelInviteMutation.variables === invite.id}
                          loading={cancelInviteMutation.isPending && cancelInviteMutation.variables === invite.id}
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
      </SettingsSectionCard>

      <SettingsSectionCard title="바로가기">
        <div className="space-y-1">
          <SettingsLinkRow
            to="/accounts?section=저축·투자"
            label="비상금 관리"
            hint="저축·투자 탭에서 비상금 항목으로 기록해요"
          />
          <SettingsLinkRow to="/categories" label="카테고리 관리" hint="고정·변동·비정기지출 카테고리 추가/수정" />
          <SettingsLinkRow
            to="/transactions/import"
            label="거래 데이터"
            hint="CSV·구글 시트 가져오기 / CSV 내보내기"
          />
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Google 계정 연동"
        badge={
          <StatusBadge
            label={connectionStatusLabel(connectionStatus)}
            toneClassName={connectionStatusBadgeClass(connectionStatus)}
            icon={
              connectionStatus === "connected" ? (
                <CheckCircle2 size={12} aria-hidden="true" />
              ) : (
                <XCircle size={12} aria-hidden="true" />
              )
            }
          />
        }
      >
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {connectionStatus === "connected"
            ? "이메일 발송·일정 가져오기에 사용되는 Google 계정이 연결되어 있어요."
            : "이메일 발송·일정 가져오기에 사용할 Google 계정이 아직 연결되지 않았어요. 웹에서 직접 연결하는 기능은 없고, 관리자가 로컬에서 scripts/google_auth_setup.py를 한 번 실행해 연결해요."}
        </p>
      </SettingsSectionCard>

      <SettingsSectionCard title="알림">
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">받을 알림 종류 — 모두 이메일로 발송돼요.</p>
          <ul className="space-y-1">
            {NOTIF_PREF_FIELDS.map(({ key, label, hint }) => (
              <li
                key={key}
                className="flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800"
              >
                <label htmlFor={`notif-pref-${key}`} className="min-w-0 cursor-pointer">
                  <p className="text-gray-700 dark:text-gray-300">{label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{hint}</p>
                </label>
                <input
                  id={`notif-pref-${key}`}
                  type="checkbox"
                  checked={data.notification_prefs[key]}
                  disabled={key === pendingPrefKey}
                  onChange={() =>
                    notificationPrefsMutation.mutate({ ...data.notification_prefs, [key]: !data.notification_prefs[key] })
                  }
                  className="h-4 w-4 rounded border-gray-300 shrink-0"
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            받는 사람 — 기본값은 가입한 이메일이며, 직접 추가·삭제할 수 있어요. 변경 즉시 반영돼요.
          </p>
          <ul className="space-y-2">
            {notifyEmails.map((email) => (
            <li
              key={email}
              className="flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800"
            >
              <span className="truncate text-gray-700 dark:text-gray-300">{email}</span>
              <Button
                variant="ghost"
                size="sm"
                aria-label="알림 이메일 삭제"
                disabled={notifyEmails.length <= 1 || email === pendingRemovedEmail}
                loading={email === pendingRemovedEmail}
                onClick={() =>
                  notifyEmailsMutation.mutate(
                    notifyEmails.filter((e) => e !== email),
                    { onSuccess: () => toast("알림 이메일을 삭제했습니다.", "success") },
                  )
                }
              >
                <X size={14} />
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <FormInput
              label="추가할 이메일"
              type="email"
              value={newNotifyEmail}
              onChange={(e) => setNewNotifyEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>
          <Button
            size="sm"
            icon={<UserPlus size={14} />}
            disabled={!newNotifyEmail || notifyEmails.length >= MAX_NOTIFY_RECIPIENTS || isAddingEmail}
            loading={isAddingEmail}
            onClick={() =>
              notifyEmailsMutation.mutate(
                [...notifyEmails, newNotifyEmail.trim().toLowerCase()],
                { onSuccess: () => toast("알림 이메일을 추가했습니다.", "success") },
              )
            }
          >
            추가
          </Button>
        </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-800 pt-3 flex gap-2">
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
      </SettingsSectionCard>

      <SettingsSectionCard title="고급 설정">
        <CollapsibleGroup
          header={<span className="text-sm font-semibold text-gray-700 dark:text-gray-300">코칭 민감도</span>}
          defaultOpen={false}
        >
          <p className="text-xs text-gray-500 dark:text-gray-400">
            대시보드 코칭 인사이트가 발동하는 기준(%)이에요. 두 분의 소비 성향에 맞게 프리셋 하나를 고르거나,
            아래에서 항목별로 직접 조정하세요.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {COACHING_THRESHOLD_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setThresholdEdits(preset.values)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <CollapsibleGroup
            header={<span className="text-xs font-medium text-gray-500 dark:text-gray-400">직접 조정 (16개 항목)</span>}
            defaultOpen={false}
          >
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
                  onChange={(e) => setThresholdEdits((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                />
              ))}
            </div>
          </CollapsibleGroup>

          <Button
            size="sm"
            disabled={Object.keys(thresholdEdits).length === 0}
            loading={thresholdsMutation.isPending}
            onClick={() => thresholdsMutation.mutate({ ...data.coaching_thresholds, ...thresholdEdits })}
          >
            저장
          </Button>
        </CollapsibleGroup>
      </SettingsSectionCard>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <Button
          variant="secondary"
          className="w-full sm:w-auto text-gray-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
          onClick={() => void logout()}
        >
          로그아웃
        </Button>
      </div>

      {removeSpouseOpen && spouse && (
        <ConfirmModal
          message={`"${spouse.display_name}"님을 가구에서 제외할까요? 거래내역 등 기존 기록은 그대로 남지만, 이후 다른 계정으로 그 자리를 채울 수 있어요.`}
          confirmLabel="제거"
          confirmDisabled={removeSpouseConfirmText !== spouse.display_name || removeSpouseMutation.isPending}
          onConfirm={() => removeSpouseMutation.mutate()}
          onCancel={() => {
            setRemoveSpouseOpen(false);
            setRemoveSpouseConfirmText("");
          }}
        >
          <div className="mt-3">
            <FormInput
              label={`확인을 위해 "${spouse.display_name}"을 입력하세요`}
              value={removeSpouseConfirmText}
              onChange={(e) => setRemoveSpouseConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
        </ConfirmModal>
      )}
    </div>
  );
}
