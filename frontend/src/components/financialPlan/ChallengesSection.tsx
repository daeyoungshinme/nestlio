import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import ProgressBar from "@/components/common/ProgressBar";
import RowActionButtons from "@/components/common/RowActionButtons";
import SkeletonCard from "@/components/common/SkeletonCard";
import {
  createChallenge,
  deleteChallenge,
  fetchChallenges,
  updateChallenge,
  updateChallengeProgress,
} from "@/api/challenges";
import { FORM_LABEL, INLINE_BUTTON_OFFSET, TEXTAREA_SM } from "@/constants/inputStyles";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { challengeStatusBadgeClass, challengeStatusLabel } from "@/utils/colors";
import { formatDate, formatKrw, formatKrwPreview, formatPercent, toAmountInputValue } from "@/utils/format";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";
import type { ChallengeOut } from "@/types";

interface Draft {
  title: string;
  description: string;
  target_amount: string;
  start_date: string;
  end_date: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_DRAFT: Draft = {
  title: "",
  description: "",
  target_amount: "0",
  start_date: todayIso(),
  end_date: todayIso(),
};

function draftFromChallenge(challenge: ChallengeOut): Draft {
  return {
    title: challenge.title,
    description: challenge.description ?? "",
    target_amount: toAmountInputValue(challenge.target_amount),
    start_date: challenge.start_date,
    end_date: challenge.end_date,
  };
}

function toPayload(draft: Draft) {
  return {
    title: draft.title,
    description: draft.description.trim() === "" ? null : draft.description,
    target_amount: draft.target_amount,
    start_date: draft.start_date,
    end_date: draft.end_date,
  };
}

/** 오늘부터 종료일까지 남은 일수. 이미 지난 챌린지는 표시하지 않는 쪽(effective_status==="expired")에서 걸러진다. */
function daysRemaining(endDate: string): number {
  const end = new Date(`${endDate}T00:00:00`);
  const today = new Date(`${todayIso()}T00:00:00`);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

function ddayLabel(challenge: ChallengeOut): string {
  if (challenge.effective_status === "succeeded") return "성공";
  if (challenge.effective_status === "expired") return "기간종료";
  const remaining = daysRemaining(challenge.end_date);
  if (remaining <= 0) return "D-Day";
  return `D-${remaining}`;
}

export default function ChallengesSection() {
  const [formTarget, setFormTarget] = useState<"new" | ChallengeOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [progressDraft, setProgressDraft] = useState<Record<number, string>>({});
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: QUERY_KEYS.challenges, queryFn: fetchChallenges });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.challenges });

  const { createMutation, updateMutation, removeMutation: deleteMutation } = useCrudMutations({
    invalidateKeys: [QUERY_KEYS.challenges],
    api: { create: createChallenge, update: updateChallenge, remove: deleteChallenge },
    messages: { create: "챌린지를 추가했습니다.", update: "저장했습니다.", remove: "삭제했습니다." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeleteTarget(null),
  });

  const progressMutation = useMutation({
    mutationFn: ({ id, current_amount }: { id: number; current_amount: string }) =>
      updateChallengeProgress(id, { current_amount }),
    onSuccess: (updated, { id }) => {
      void invalidate();
      setProgressDraft((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      if (updated.status === "succeeded") {
        toast(`"${updated.title}" 챌린지 성공! 두 분이 함께 해냈어요 🎉`, "success");
      } else {
        toast("진행 금액을 저장했습니다.", "success");
      }
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  if (isLoading || !data) {
    return <SkeletonCard rows={3} />;
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (draft: Draft) => {
    if (formTarget === "new") {
      createMutation.mutate(toPayload(draft));
    } else if (formTarget) {
      updateMutation.mutate({ id: formTarget.id, payload: toPayload(draft) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new")}>
          챌린지 추가
        </Button>
      </div>

      {data.length === 0 ? (
        <EmptyState
          title="진행 중인 챌린지가 없어요"
          description="위 버튼으로 부부가 함께할 첫 챌린지를 만들어보세요"
          compact
        />
      ) : (
        <div className="space-y-2">
          {data.map((challenge) => {
            const draftValue = progressDraft[challenge.id] ?? toAmountInputValue(challenge.current_amount);
            const isActive = challenge.effective_status === "active";
            return (
              <div key={challenge.id} className="card space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
                        {challenge.title}
                      </p>
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium ${challengeStatusBadgeClass(challenge.effective_status)}`}
                      >
                        {challengeStatusLabel(challenge.effective_status)}
                      </span>
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        {ddayLabel(challenge)}
                      </span>
                    </div>
                    {challenge.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {challenge.description}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {formatDate(challenge.start_date)} ~ {formatDate(challenge.end_date)}
                    </p>
                  </div>
                  <RowActionButtons
                    onEdit={() => setFormTarget(challenge)}
                    onDelete={() => setDeleteTarget(challenge.id)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <ProgressBar pct={Number(challenge.progress_pct)} />
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    {formatPercent(Number(challenge.progress_pct))}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatKrw(challenge.current_amount)} / 목표 {formatKrw(challenge.target_amount)}
                </p>
                {isActive && (
                  <div className="flex items-start flex-wrap gap-2 pt-1">
                    <FormInput
                      label="진행 금액 갱신"
                      type="number"
                      inputMode="decimal"
                      value={draftValue}
                      onChange={(e) => setProgressDraft((d) => ({ ...d, [challenge.id]: e.target.value }))}
                      className="w-full sm:w-40"
                      preview={Number(draftValue) > 0 ? formatKrwPreview(Number(draftValue)) : undefined}
                    />
                    <Button
                      size="sm"
                      loading={progressMutation.isPending && progressMutation.variables?.id === challenge.id}
                      onClick={() => progressMutation.mutate({ id: challenge.id, current_amount: draftValue })}
                      className={`${INLINE_BUTTON_OFFSET} min-h-[44px]`}
                    >
                      저장
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {formTarget && (
        <ChallengeFormModal
          initial={formTarget === "new" ? EMPTY_DRAFT : draftFromChallenge(formTarget)}
          title={formTarget === "new" ? "챌린지 추가" : "챌린지 수정"}
          submitLabel={formTarget === "new" ? "추가" : "저장"}
          submitting={isSaving}
          onClose={() => setFormTarget(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deleteTarget !== null && (
        <ConfirmModal
          message="이 챌린지를 삭제할까요?"
          onConfirm={() => deleteMutation.mutate(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function ChallengeFormModal({
  initial,
  title,
  submitLabel,
  submitting,
  onClose,
  onSubmit,
}: {
  initial: Draft;
  title: string;
  submitLabel: string;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (draft: Draft) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) return;
    onSubmit(draft);
  };

  return (
    <Modal onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
        <FormInput
          label="챌린지 제목"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className="w-full"
          required
        />
        <div>
          <label className={FORM_LABEL}>설명 (선택)</label>
          <textarea
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            className={`w-full ${TEXTAREA_SM}`}
            rows={2}
          />
        </div>
        <FormInput
          label="목표 금액"
          type="number"
          inputMode="decimal"
          value={draft.target_amount}
          onChange={(e) => setDraft((d) => ({ ...d, target_amount: e.target.value }))}
          className="w-full"
          preview={Number(draft.target_amount) > 0 ? formatKrwPreview(Number(draft.target_amount)) : undefined}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormInput
            label="시작일"
            type="date"
            value={draft.start_date}
            onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))}
            className="w-full"
          />
          <FormInput
            label="종료일"
            type="date"
            value={draft.end_date}
            onChange={(e) => setDraft((d) => ({ ...d, end_date: e.target.value }))}
            className="w-full"
            min={draft.start_date}
          />
        </div>
        <Button type="submit" loading={submitting} className="mt-2">
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}
