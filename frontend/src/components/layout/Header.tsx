import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, PiggyBank } from "lucide-react";
import Modal from "@/components/common/Modal";
import EmptyState from "@/components/common/EmptyState";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  reactToNotification,
} from "@/api/notifications";
import { useMe } from "@/hooks/useReferenceData";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { SIDEBAR_NAV_ITEMS } from "@/constants/nav";
import { TOUCH_TARGET_COMPACT_MOBILE_ONLY, TOUCH_TARGET_MIN } from "@/constants/uiSizes";
import { formatDate } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { NotificationOut } from "@/types";

const NOTIF_TYPE_LABEL: Record<string, string> = {
  email_weekly: "주간 요약",
  email_monthly: "월간 요약",
  threshold_alert: "예산 초과 경고",
  goal_milestone: "목표 마일스톤 달성",
  challenge_success: "챌린지 성공",
  event_reminder: "일정 알림",
};

// 목표 마일스톤 축하 알림에만 응원 반응을 남길 수 있다 — 다른 알림 종류(예산 경고 등)는
// 축하할 대상이 아니라서 반응 UI 자체를 노출하지 않는다.
const REACTABLE_NOTIF_TYPES = new Set(["goal_milestone", "challenge_success"]);
const REACTION_EMOJIS = ["🎉", "👏", "❤️", "💪", "🥳"];

function notificationTitle(n: NotificationOut): string {
  return NOTIF_TYPE_LABEL[n.notif_type] ?? n.notif_type;
}

/** 현재 경로에 대응하는 사이드바 nav 항목의 라벨. `/categories`처럼 nav에 없는 경로는 undefined. */
function currentPageLabel(pathname: string): string | undefined {
  if (pathname === "/") return SIDEBAR_NAV_ITEMS.find((item) => item.to === "/")?.label;
  return SIDEBAR_NAV_ITEMS.filter((item) => item.to !== "/" && pathname.startsWith(item.to)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0]?.label;
}

export default function Header() {
  const [showInbox, setShowInbox] = useState(false);
  const location = useLocation();
  const pageLabel = currentPageLabel(location.pathname);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: fetchNotifications,
    refetchInterval: 60_000,
  });
  const { data: me } = useMe();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });

  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => void invalidate(),
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => void invalidate(),
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const reactMutation = useMutation({
    mutationFn: reactToNotification,
    onSuccess: () => void invalidate(),
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const unreadCount = data?.unread_count ?? 0;

  return (
    <header className="flex items-center justify-between lg:justify-end px-3 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-2 lg:px-6 lg:py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="flex items-center gap-2 lg:hidden min-w-0">
        <PiggyBank className="text-blue-600 dark:text-blue-400 shrink-0" size={20} aria-hidden="true" />
        {pageLabel && (
          <span className="font-bold text-base text-gray-900 dark:text-gray-50 truncate">{pageLabel}</span>
        )}
      </div>
      <button
        onClick={() => setShowInbox(true)}
        aria-label={unreadCount > 0 ? `알림, 읽지 않음 ${unreadCount}건` : "알림"}
        className={`relative ${TOUCH_TARGET_MIN} p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors`}
      >
        <Bell size={20} aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center"
            aria-hidden="true"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {showInbox && (
        <Modal onClose={() => setShowInbox(false)} title="알림" size="sm" closeOnBackdrop>
          <div className="flex flex-col max-h-[70dvh]">
            {unreadCount > 0 && (
              <div className="flex justify-end px-4 pt-3">
                <button
                  onClick={() => readAllMutation.mutate()}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  모두 읽음
                </button>
              </div>
            )}
            <div className="overflow-y-auto px-2 py-2">
              {data && data.items.length === 0 && (
                <EmptyState icon={Bell} title="알림이 없습니다" compact />
              )}
              {data?.items.map((n) => {
                const myReaction = me ? n.reactions.find((r) => r.user_id === me.id) : undefined;
                const otherReactions = me ? n.reactions.filter((r) => r.user_id !== me.id) : n.reactions;
                return (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => !n.is_read && readMutation.mutate(n.id)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      if (!n.is_read) readMutation.mutate(n.id);
                    }}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors cursor-pointer ${
                      n.is_read
                        ? "text-gray-500 dark:text-gray-400"
                        : "bg-blue-50 dark:bg-blue-950 text-gray-900 dark:text-gray-50"
                    } hover:bg-gray-100 dark:hover:bg-gray-800`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{notificationTitle(n)}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                        {formatDate(n.sent_at.slice(0, 10))}
                      </span>
                    </div>
                    {n.detail && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line line-clamp-2">
                        {n.detail}
                      </p>
                    )}
                    {REACTABLE_NOTIF_TYPES.has(n.notif_type) && (
                      <div onClick={(e) => e.stopPropagation()} className="mt-2 flex items-center flex-wrap gap-1.5">
                        {REACTION_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => reactMutation.mutate({ id: n.id, emoji })}
                            aria-label={`${emoji}로 응원하기`}
                            aria-pressed={myReaction?.emoji === emoji}
                            className={`${TOUCH_TARGET_COMPACT_MOBILE_ONLY} rounded-full text-sm transition-colors ${
                              myReaction?.emoji === emoji
                                ? "bg-blue-100 dark:bg-blue-900 ring-2 ring-blue-400 dark:ring-blue-600"
                                : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                        {otherReactions.length > 0 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {otherReactions.map((r) => `${r.emoji} ${r.display_name}`).join(" · ")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}
    </header>
  );
}
