import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import ShowAllToggle, { DETAIL_LIST_LIMIT } from "@/components/financialPlan/goalDetail/ShowAllToggle";
import { cheerGoal } from "@/api/goals";
import { INPUT_SM } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useNotifications } from "@/hooks/useNotifications";
import { CHEER_EMOJIS } from "@/utils/cheers";
import { formatDate } from "@/utils/format";
import { toast } from "@/utils/toast";
import type { NotificationOut, NotifType } from "@/types";

const GOAL_NOTIF_TYPES: ReadonlySet<NotifType> = new Set(["goal_milestone", "challenge_success", "goal_cheer"]);

/** "서로 응원하기" — 이모지·한마디로 배우자에게 응원을 보내고, 이 목표의 축하·응원 기록을 보여준다. */
export default function GoalCheerCard({ goalId }: { goalId: number }) {
  const [cheerMessage, setCheerMessage] = useState("");
  const [showAllCheers, setShowAllCheers] = useState(false);
  const queryClient = useQueryClient();
  const { data: notifications } = useNotifications();

  const cheerMutation = useMutation({
    mutationFn: (emoji: string) => cheerGoal(goalId, { emoji, message: cheerMessage.trim() || null }),
    onSuccess: () => {
      setCheerMessage("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
      toast("응원을 보냈어요! 배우자의 알림함에 전해져요.", "success");
    },
  });

  const goalNotifications: NotificationOut[] = (notifications?.items ?? []).filter(
    (n) => GOAL_NOTIF_TYPES.has(n.notif_type) && n.related_id === goalId,
  );
  const shownNotifications = showAllCheers ? goalNotifications : goalNotifications.slice(0, DETAIL_LIST_LIMIT);

  return (
    <div className="card space-y-3">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">서로 응원하기</h2>
      <input
        type="text"
        value={cheerMessage}
        onChange={(e) => setCheerMessage(e.target.value)}
        maxLength={200}
        placeholder="한마디 남기기 (선택)"
        className={`${INPUT_SM} w-full`}
        aria-label="응원 메시지"
      />
      <div className="flex flex-wrap gap-2">
        {CHEER_EMOJIS.map((emoji) => (
          <Button
            key={emoji}
            variant="secondary"
            size="sm"
            disabled={cheerMutation.isPending}
            onClick={() => cheerMutation.mutate(emoji)}
            aria-label={`${emoji}로 응원 보내기`}
          >
            {emoji}
          </Button>
        ))}
      </div>
      {goalNotifications.length > 0 && (
        <ul className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          {shownNotifications.map((n) => (
            <li key={n.id} className="text-sm text-gray-700 dark:text-gray-300">
              <span className="text-xs text-gray-500 dark:text-gray-400 mr-1.5">{formatDate(n.sent_at.slice(0, 10))}</span>
              {n.detail?.split("\n")[0]}
              {n.notif_type !== "goal_cheer" && n.reactions.length > 0 && (
                <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {n.reactions.map((r) => `${r.emoji} ${r.display_name}`).join(" · ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {goalNotifications.length > DETAIL_LIST_LIMIT && (
        <ShowAllToggle
          expanded={showAllCheers}
          total={goalNotifications.length}
          onToggle={() => setShowAllCheers((v) => !v)}
        />
      )}
    </div>
  );
}
