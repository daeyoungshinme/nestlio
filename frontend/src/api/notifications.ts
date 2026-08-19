import { apiDelete, apiGet, apiPost, apiPut } from "@/api/client";
import type { NotificationListOut } from "@/types";

export const fetchNotifications = () => apiGet<NotificationListOut>("/notifications");

export const markNotificationRead = (id: number) => apiPost<void>(`/notifications/${id}/read`);

export const markAllNotificationsRead = () => apiPost<{ marked: number }>("/notifications/read-all");

export const reactToNotification = ({ id, emoji }: { id: number; emoji: string }) =>
  apiPut<void>(`/notifications/${id}/reaction`, { emoji });

export const removeNotificationReaction = (id: number) => apiDelete<void>(`/notifications/${id}/reaction`);
