import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import CollapsibleHint from "@/components/common/CollapsibleHint";
import CombinedMembersList from "@/components/financialPlan/CombinedMembersList";
import { refreshGrowlioGoalSnapshot } from "@/api/goals";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useMe } from "@/hooks/useReferenceData";
import { formatKrw, formatKrwCompact } from "@/utils/format";
import { invalidateKeys } from "@/utils/queryClient";
import { toast } from "@/utils/toast";
import type { FinancialGoalOut } from "@/types";

/** 부부 통합 목표의 구성별 진행 — growlio 구성은 입금·배당·수익률 보조값과 마지막 동기화 시각을 함께 보여주고, 본인
 * growlio 값은 바로 다시 불러올 수 있다(배우자 값은 배우자가 nestlio를 열 때만 갱신된다). */
export default function CombinedMembersCard({ goal }: { goal: FinancialGoalOut }) {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const [openedAt] = useState(() => new Date());
  const refreshMutation = useMutation({
    mutationFn: refreshGrowlioGoalSnapshot,
    onSuccess: () => {
      invalidateKeys(queryClient, [QUERY_KEYS.financialGoals, QUERY_KEYS.dashboardBootstrap]);
      toast("growlio 목표를 다시 불러왔어요.", "success");
    },
  });
  const overlap = Number(goal.overlap_amount ?? 0);
  return (
    <div className="card space-y-3">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">함께 묶은 목표</h2>
      <CombinedMembersList
        members={goal.combined_members}
        meId={me?.id ?? null}
        now={openedAt}
        onRefreshMine={() => refreshMutation.mutate()}
        refreshing={refreshMutation.isPending}
      />
      {overlap > 0 && (
        <CollapsibleHint summary={`growlio와 겹치는 ${formatKrwCompact(overlap)}은 한 번만 셌어요.`}>
          growlio에서 가져온 투자 상품·계좌를 장기 목표에 연동해 두면 그 잔액이 growlio 투자자산에도 들어 있어요. 합계에서는
          {" "}{formatKrw(overlap)}을 빼서 중복으로 세지 않았어요. 부동산은 growlio 목표 기준(부동산 제외)에 없어 빼지 않아요.
        </CollapsibleHint>
      )}
    </div>
  );
}
