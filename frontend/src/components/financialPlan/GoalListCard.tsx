import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import AmountInput from "@/components/common/AmountInput";
import Button from "@/components/common/Button";
import CombinedMembersList from "@/components/financialPlan/CombinedMembersList";
import GoalProgressCard from "@/components/financialPlan/GoalProgressCard";
import type { GoalProgressCardBadge, GoalProgressCardExtraDetail } from "@/components/financialPlan/GoalProgressCard";
import { draftFromGoal, toPayload } from "@/components/financialPlan/goalDraft";
import { updateGoal, updateGoalMonthlyTarget } from "@/api/goals";
import { INLINE_BUTTON_OFFSET } from "@/constants/inputStyles";
import { goalDetailLink } from "@/constants/routes";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { progressStatusBadgeClass, progressStatusLabel } from "@/utils/colors";
import { formatDate, formatKrw, formatKrwCompact, formatYearMonth, toAmountInputValue } from "@/utils/format";
import { celebrateIfCrossed } from "@/utils/goalMilestone";
import { computeCardStatus, daysUntil } from "@/utils/goalStatus";
import { toast } from "@/utils/toast";
import type { FinancialGoalOut } from "@/types";

/** 목표 목록의 카드 하나 — 장기목표·챌린지·순자산·통합 목표가 같은 GoalProgressCard 조립을 공유한다. 챌린지는
 * 연동/월별계획을 쓰지 않는 필드 구성(toPayload 참고)이라 관련 블록이 데이터 기반으로 자연히 비게 되고, 배지와
 * 빠른 입력(진행 금액 갱신·이번 달 저축액) 노출 조건에서만 갈라진다. 빠른 입력의 초안·저장은 카드마다 따로 둔다. */
export default function GoalListCard({
  goal,
  meId,
  openedAt,
  onEdit,
  onDelete,
  onSaved,
}: {
  goal: FinancialGoalOut;
  meId: string | null;
  /** 화면을 연 시점(통합 목표 구성의 동기화 오래됨 판정용). */
  openedAt: Date;
  onEdit: () => void;
  onDelete: () => void;
  /** 빠른 입력 저장 뒤 목표 관련 쿼리 무효화. */
  onSaved: () => void;
}) {
  const [progressDraft, setProgressDraft] = useState<string | null>(null);
  const [monthlyTargetDraft, setMonthlyTargetDraft] = useState<Record<string, string>>({});
  /** 모바일에서 빠른 입력을 펼쳤는지 — 카드마다 입력칸이 늘 떠 있으면 목록이 길어진다. */
  const [entryOpen, setEntryOpen] = useState(false);

  // 챌린지 등의 "진행 금액 갱신" 인라인 저장 전용 — 수정 모달 저장과 달리 매번 "저장했습니다."를
  // 띄우지 않고, 목표 달성 여부에 따라 다른 토스트 하나만 보여준다.
  const progressMutation = useMutation({
    mutationFn: (current_amount: string) => updateGoal(goal.id, { ...toPayload(draftFromGoal(goal)), current_amount }),
    onSuccess: (updated) => {
      onSaved();
      setProgressDraft(null);
      if (updated.status === "succeeded") {
        toast(`"${updated.name}" 챌린지 성공! 두 분이 함께 해냈어요 🎉`, "success");
      } else {
        toast("진행 금액을 저장했습니다.", "success");
      }
    },
  });

  // 장기목표 카드의 월별 행 인라인 "이번 달 저축액 입력" 저장 전용 — 전체 목표를 다시 보내지 않고 그 달의
  // achieved_amount만 갱신한다. 연동된 장기목표는 이 mutation을 쓰지 않는다(자동계산이라 저장 버튼 자체가 없음).
  const monthlyTargetMutation = useMutation({
    mutationFn: ({ yearMonth, achievedAmount }: { yearMonth: string; achievedAmount: string; oldPct: number }) =>
      updateGoalMonthlyTarget(goal.id, yearMonth, achievedAmount),
    onSuccess: (updated, { yearMonth, oldPct }) => {
      onSaved();
      setMonthlyTargetDraft((d) => {
        const next = { ...d };
        delete next[yearMonth];
        return next;
      });
      toast("이번 달 저축액을 저장했습니다.", "success");
      celebrateIfCrossed(oldPct, updated);
    },
  });

  const isChallenge = goal.kind === "challenge";
  const isNetWorth = goal.kind === "net_worth";
  const isCombined = goal.kind === "combined";
  const hasLoanSource = goal.funding_sources.some((fs) => fs.type === "loan");
  const status = computeCardStatus(goal);

  // 아직 달성 못한 가장 이른 달 — 연동 목표는 거래내역 기반 자동계산값(is_auto_computed)이라
  // 저장 버튼 없이 읽기 전용으로 보여주고, 미연동 목표는 인라인 입력을 쓴다
  // (app/services/goal_service.py::compute_linked_monthly_achieved 참고). 챌린지는 월별 계획
  // 자체가 없어(toPayload에서 항상 monthly_targets: null로 저장) 이 블록이 자연히 no-op된다.
  const activeMonth = goal.monthly_targets.find((mt) => !mt.is_achieved) ?? null;
  const isAutoComputed = activeMonth?.is_auto_computed ?? false;
  const monthlyEntryMonth = activeMonth && !isAutoComputed ? activeMonth.year_month : null;
  const monthlyDraftValue =
    monthlyEntryMonth !== null
      ? (monthlyTargetDraft[monthlyEntryMonth] ?? toAmountInputValue(activeMonth!.achieved_amount))
      : "0";

  // 연동(funding_sources)도 없고 월별 계획(monthly_targets)도 없는 목표는 거래내역이나 월별
  // 그리드로 진행률을 갱신할 방법이 없어, 카드에서 현재 금액을 직접 입력해 갱신한다. 챌린지는
  // 애초에 연동·월별계획 개념이 없어(toPayload 참고) 활성 상태인 동안 항상 이 경로를 탄다 —
  // 만료된 챌린지는 더 이상 갱신할 수 없어 위젯을 숨긴다.
  const progressDraftValue = progressDraft ?? toAmountInputValue(goal.current_amount);
  // 순자산·통합 목표는 자산·구성 목표를 그대로 따라가므로 직접 입력할 것이 없다.
  const showProgressUpdateWidget =
    !isNetWorth &&
    !isCombined &&
    goal.funding_sources.length === 0 &&
    goal.monthly_targets.length === 0 &&
    (isChallenge ? goal.effective_status === "active" : status !== "achieved");

  const badges: GoalProgressCardBadge[] = [
    { label: progressStatusLabel(status), toneClassName: progressStatusBadgeClass(status) },
  ];
  if (isChallenge) {
    badges.push({ label: "챌린지", toneClassName: progressStatusBadgeClass("neutral") });
  }
  if (isNetWorth) {
    badges.push({ label: "순자산 목표", toneClassName: progressStatusBadgeClass("neutral") });
  }
  if (isCombined) {
    badges.push({ label: "통합 목표", toneClassName: progressStatusBadgeClass("neutral") });
  }
  if (isAutoComputed) {
    badges.push({ label: "이번 달 자동계산", toneClassName: progressStatusBadgeClass("neutral") });
  }

  const extraDetails: GoalProgressCardExtraDetail[] = [];
  if (!isChallenge && goal.eta_year_month) {
    const ab = goal.ahead_behind_months;
    extraDetails.push({
      key: "eta",
      content: `현재 저축 속도면 ${formatYearMonth(goal.eta_year_month)} 도달 예상${
        ab !== null ? ` · 목표일 대비 ${Math.abs(ab)}개월 ${ab >= 0 ? "빠름" : "늦음"}` : ""
      }`,
    });
  }
  if (isCombined && goal.combined_members.length > 0) {
    extraDetails.push({
      key: "members",
      content: <CombinedMembersList members={goal.combined_members} meId={meId} now={openedAt} compact />,
    });
  }

  // 빠른 입력(진행 금액/이번 달 저축액). 모바일은 "기록" 버튼을 눌러야 펼친다.
  const renderEntry = () =>
    showProgressUpdateWidget ? (
      <div className="flex items-start flex-wrap gap-2 pt-1">
        <AmountInput
          label="진행 금액 갱신"
          value={progressDraftValue}
          onChange={setProgressDraft}
          className="w-full sm:w-40"
        />
        <Button
          size="sm"
          loading={progressMutation.isPending}
          onClick={() => progressMutation.mutate(progressDraftValue)}
          className={`${INLINE_BUTTON_OFFSET} ${TOUCH_TARGET_MIN_HEIGHT}`}
        >
          저장
        </Button>
      </div>
    ) : activeMonth && isAutoComputed ? (
      <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">
        {activeMonth.year_month} 이번 달 자동계산: {formatKrw(activeMonth.achieved_amount)} /{" "}
        {formatKrw(activeMonth.target_amount)}
      </p>
    ) : activeMonth && monthlyEntryMonth !== null ? (
      <div className="flex items-start flex-wrap gap-2 pt-1">
        <AmountInput
          label={`${activeMonth.year_month} 저축액 입력`}
          value={monthlyDraftValue}
          onChange={(value) => setMonthlyTargetDraft((d) => ({ ...d, [monthlyEntryMonth]: value }))}
          className="w-full sm:w-40"
        />
        <Button
          size="sm"
          loading={monthlyTargetMutation.isPending}
          onClick={() =>
            monthlyTargetMutation.mutate({
              yearMonth: activeMonth.year_month,
              achievedAmount: monthlyDraftValue,
              oldPct: Number(goal.progress_pct),
            })
          }
          className={`${INLINE_BUTTON_OFFSET} ${TOUCH_TARGET_MIN_HEIGHT}`}
        >
          저장
        </Button>
      </div>
    ) : undefined;

  return (
    <GoalProgressCard
      title={goal.name}
      metaLine={`${
        isNetWorth
          ? `가구 순자산${goal.exclude_real_estate ? "(부동산 제외)" : ""} 기준`
          : isCombined ? `구성 ${goal.combined_members.length}개` : `${goal.priority}순위`
      }${
        goal.target_date !== null
          ? ` · D-${daysUntil(goal.target_date)}`
          : goal.target_age !== null
            ? ` · ${goal.target_age}세까지`
            : ""
      }${goal.funding_sources.length > 0 ? ` · 연동 ${goal.funding_sources.length}건` : ""}`}
      badges={badges}
      subtitle={
        goal.description || (goal.start_date && goal.target_date) ? (
          <>
            {goal.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{goal.description}</p>
            )}
            {goal.start_date && goal.target_date && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                {formatDate(goal.start_date)} ~ {formatDate(goal.target_date)}
              </p>
            )}
          </>
        ) : undefined
      }
      pct={Number(goal.progress_pct)}
      primaryDetail={
        <>
          {isCombined ? "합계" : goal.funding_sources.length > 0 ? "연동 잔액" : "저축"}{" "}
          {formatKrwCompact(Number(goal.current_amount))} / 목표 {formatKrwCompact(Number(goal.required_amount))}
          {!isChallenge && <> · 월 {formatKrwCompact(Number(goal.planned_monthly_amount))}</>}
          {hasLoanSource && " (대출 차감)"}
        </>
      }
      pinnedDetail={
        <Link
          to={goalDetailLink(goal.id)}
          className={`inline-flex items-center ${TOUCH_TARGET_MIN_HEIGHT} text-xs font-semibold text-primary-600 dark:text-primary-400 hover:underline`}
        >
          자세히 보기 · 서로 응원하기 →
        </Link>
      }
      extraDetails={extraDetails}
      onEdit={onEdit}
      onDelete={onDelete}
      footer={
        (showProgressUpdateWidget || monthlyEntryMonth !== null) && !entryOpen ? (
          <>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setEntryOpen(true)} className="sm:hidden">
              {showProgressUpdateWidget ? "진행 금액 기록" : `${activeMonth!.year_month} 저축액 기록`}
            </Button>
            <div className="hidden sm:block">{renderEntry()}</div>
          </>
        ) : (
          renderEntry()
        )
      }
    />
  );
}
