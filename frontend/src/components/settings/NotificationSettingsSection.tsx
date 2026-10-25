import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Mail, UserPlus, XCircle } from "lucide-react";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import FormInput from "@/components/common/FormInput";
import StatusBadge from "@/components/common/StatusBadge";
import { SettingsSectionCard, ToggleRow, onMutationError } from "@/components/settings/shared";
import { setNotificationPrefs, setNotifyEmails, testMonthlyEmail, testWeeklyEmail } from "@/api/settings";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { MAX_NOTIFY_RECIPIENTS } from "@/constants/settings";
import { cautionTextClass, connectionStatusBadgeClass, connectionStatusLabel, dangerActionClass } from "@/utils/colors";
import { toast } from "@/utils/toast";
import type { NotificationPrefsOut } from "@/types";

const NOTIF_PREF_FIELDS: { key: keyof NotificationPrefsOut; label: string; hint: string }[] = [
  { key: "email_weekly", label: "주간 요약", hint: "매주 가계부 요약 이메일" },
  { key: "email_monthly", label: "월간 요약", hint: "매달 가계부 요약 + 코칭 인사이트 이메일" },
  { key: "threshold_alert", label: "예산 초과 경고", hint: "카테고리 예산이 주의/위험 기준을 넘으면 알림" },
  { key: "goal_milestone", label: "목표 마일스톤 달성", hint: "재무목표가 25/50/75/100%에 도달하면 축하 알림" },
  { key: "challenge_success", label: "챌린지 성공", hint: "부부 챌린지를 달성하면 축하 알림" },
  { key: "event_reminder", label: "일정 알림", hint: "등록한 개인 일정·리마인더의 알림 시각이 되면 이메일" },
  {
    key: "savings_pace_reminder",
    label: "월말 저축 리마인더",
    hint: "월말 3일 전, 이번 달 저축·투자 계획을 다 못 채웠으면 남은 금액을 알려줘요",
  },
  {
    key: "partner_saving",
    label: "배우자 저축 소식",
    hint: "한 사람이 저축·투자 내역을 기록하면 알림함에 알려줘요 — 바로 응원 반응을 남길 수 있어요",
  },
];

interface Props {
  prefs: NotificationPrefsOut;
  notifyEmails: string[];
  /** 메일을 보내는 Gmail 계정 연결 여부 — 예전엔 상태 배지 하나뿐인 별도 카드였다. */
  gmailConnected: boolean;
}

export default function NotificationSettingsSection({ prefs, notifyEmails, gmailConnected }: Props) {
  const gmailStatus = gmailConnected ? "connected" : "disconnected";
  const queryClient = useQueryClient();
  const [newNotifyEmail, setNewNotifyEmail] = useState("");
  const invalidateSettings = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardBootstrap });
  };

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

  const notifyEmailsMutation = useMutation({
    mutationFn: setNotifyEmails,
    onSuccess: () => {
      invalidateSettings();
      setNewNotifyEmail("");
    },
    onError: onMutationError,
  });

  const notificationPrefsMutation = useMutation({
    mutationFn: setNotificationPrefs,
    onSuccess: () => {
      invalidateSettings();
      toast("알림 설정을 저장했습니다.", "success");
    },
    onError: onMutationError,
  });

  const pendingPrefKey = notificationPrefsMutation.isPending
    ? NOTIF_PREF_FIELDS.find(({ key }) => notificationPrefsMutation.variables?.[key] !== prefs[key])?.key
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
    <SettingsSectionCard
      title="알림"
      badge={
        <StatusBadge
          label={`메일 ${connectionStatusLabel(gmailStatus)}`}
          toneClassName={connectionStatusBadgeClass(gmailStatus)}
          icon={gmailConnected ? <CheckCircle2 size={12} aria-hidden="true" /> : <XCircle size={12} aria-hidden="true" />}
        />
      }
    >
      {!gmailConnected && (
        // 예전 문구는 사용자에게 scripts/google_auth_setup.py 실행을 안내했다 — 관리자 작업이라 결과만 알린다.
        <p className={`text-xs ${cautionTextClass()}`}>
          알림 메일 발송이 멈춰 있어요. 알림은 앱 알림함에서 계속 볼 수 있고, 메일은 관리자가 다시 연결하면 재개돼요.
        </p>
      )}
      <div className="space-y-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          켜 둔 알림은 이메일과 앱 알림함으로 와요(배우자 저축 소식은 알림함만).
        </p>
        <ul className="space-y-1">
          {NOTIF_PREF_FIELDS.map(({ key, label, hint }) => (
            <li key={key}>
              <ToggleRow
                label={label}
                hint={hint}
                checked={prefs[key]}
                disabled={key === pendingPrefKey}
                onChange={(next) => notificationPrefsMutation.mutate({ ...prefs, [key]: next })}
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
                aria-label={`${email} 알림 이메일 삭제`}
                className={dangerActionClass("hover")}
                disabled={notifyEmails.length <= 1 || email === pendingRemovedEmail}
                loading={email === pendingRemovedEmail}
                onClick={() =>
                  notifyEmailsMutation.mutate(
                    notifyEmails.filter((e) => e !== email),
                    { onSuccess: () => toast("알림 이메일을 삭제했습니다.", "success") },
                  )
                }
              >
                삭제
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
              notifyEmailsMutation.mutate([...notifyEmails, newNotifyEmail.trim().toLowerCase()], {
                onSuccess: () => toast("알림 이메일을 추가했습니다.", "success"),
              })
            }
          >
            추가
          </Button>
        </div>
      </div>

      {/* 테스트 발송은 연결 확인용이라 평소엔 접어 둔다. */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-1">
        <CollapsibleGroup
          header={<span className="text-xs font-medium text-gray-500 dark:text-gray-400">요약 메일 테스트 발송</span>}
          defaultOpen={false}
        >
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
        </CollapsibleGroup>
      </div>
    </SettingsSectionCard>
  );
}
