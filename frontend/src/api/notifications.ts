import { apiGet, apiPost } from "@/api/client";
import type { NotificationListOut } from "@/types";

export const fetchNotifications = () => apiGet<NotificationListOut>("/notifications");

export const markNotificationRead = (id: number) => apiPost<void>(`/notifications/${id}/read`);

export const markAllNotificationsRead = () => apiPost<{ marked: number }>("/notifications/read-all");
