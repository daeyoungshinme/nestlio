import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, UserPlus, X } from "lucide-react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import { SettingsSectionCard, onMutationError } from "@/components/settings/shared";
import { setNotificationPrefs, setNotifyEmails, testMonthlyEmail, testWeeklyEmail } from "@/api/settings";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { MAX_NOTIFY_RECIPIENTS } from "@/constants/settings";
import { toast } from "@/utils/toast";
import type { NotificationPrefsOut } from "@/types";

const NOTIF_PREF_FIELDS: { key: keyof NotificationPrefsOut; label: string; hint: string }[] = [
  { key: "email_weekly", label: "주간 요약", hint: "매주 가계부 요약 이메일" },
  { key: "email_monthly", label: "월간 요약", hint: "매달 가계부 요약 + 코칭 인사이트 이메일" },
  { key: "threshold_alert", label: "예산 초과 경고", hint: "카테고리 예산이 주의/위험 기준을 넘으면 알림" },
  { key: "goal_milestone", label: "목표 마일스톤 달성", hint: "재무목표가 25/50/75/100%에 도달하면 축하 알림" },
  { key: "challenge_success", label: "챌린지 성공", hint: "부부 챌린지를 달성하면 축하 알림" },
  { key: "event_reminder", label: "일정 알림", hint: "등록한 개인 일정·리마인더의 알림 시각이 되면 이메일" },
];

interface Props {
  prefs: NotificationPrefsOut;
  notifyEmails: string[];
}

export default function NotificationSettingsSection({ prefs, notifyEmails }: Props) {
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
                checked={prefs[key]}
                disabled={key === pendingPrefKey}
                onChange={() => notificationPrefsMutation.mutate({ ...prefs, [key]: !prefs[key] })}
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
              notifyEmailsMutation.mutate([...notifyEmails, newNotifyEmail.trim().toLowerCase()], {
                onSuccess: () => toast("알림 이메일을 추가했습니다.", "success"),
              })
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
  );
}
