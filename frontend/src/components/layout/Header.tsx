import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, PiggyBank } from "lucide-react";
import Modal from "@/components/common/Modal";
import EmptyState from "@/components/common/EmptyState";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "@/api/notifications";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { SIDEBAR_NAV_ITEMS } from "@/constants/nav";
import { TOUCH_TARGET_MIN } from "@/constants/uiSizes";
import { formatDate } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { NotificationOut } from "@/types";

const NOTIF_TYPE_LABEL: Record<string, string> = {
  email_weekly: "주간 요약",
  email_monthly: "월간 요약",
  threshold_alert: "예산 초과 경고",
  goal_milestone: "목표 마일스톤 달성",
  event_reminder: "일정 알림",
  calendar_event: "캘린더 이벤트",
};

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
        aria-label="알림"
        className={`relative ${TOUCH_TARGET_MIN} p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors`}
      >
        <Bell size={20} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
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
              {data?.items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.is_read && readMutation.mutate(n.id)}
                  className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
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
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </header>
  );
}
