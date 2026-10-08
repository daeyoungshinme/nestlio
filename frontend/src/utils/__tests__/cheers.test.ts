import { describe, expect, it } from "vitest";
import { latestPartnerCheer } from "@/utils/cheers";
import type { NotificationOut } from "@/types";

const notif = (id: number, notif_type: string, reactions: NotificationOut["reactions"]): NotificationOut => ({
  id,
  notif_type,
  related_type: null,
  related_id: null,
  year_month: null,
  sent_at: "2026-10-08T09:00:00",
  detail: null,
  is_read: false,
  reactions,
});
const reaction = (user_id: string, emoji: string, created_at: string) => ({
  user_id,
  display_name: user_id,
  emoji,
  message: null,
  created_at,
});

describe("latestPartnerCheer", () => {
  it("includes direct goal cheers and partner-saving reactions, newest first, excluding mine", () => {
    const items = [
      notif(1, "goal_milestone", [reaction("partner", "🎉", "2026-10-01T10:00:00")]),
      notif(2, "goal_cheer", [reaction("partner", "💪", "2026-10-07T10:00:00")]),
      notif(3, "partner_saving", [reaction("me", "👏", "2026-10-08T10:00:00")]),
      notif(4, "threshold_alert", [reaction("partner", "❤️", "2026-10-09T10:00:00")]),
    ];
    expect(latestPartnerCheer({ items, unread_count: 0 }, "me")?.emoji).toBe("💪");
  });

  it("returns null without data", () => {
    expect(latestPartnerCheer(undefined, "me")).toBeNull();
  });
});
