import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import QueryBoundary from "@/components/common/QueryBoundary";
import { setInsuranceTargets } from "@/api/settings";
import { COVERAGE_LABEL, TARGETED_COVERAGES } from "@/constants/insurance";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useSettings } from "@/hooks/useReferenceData";
import { extractErrorMessage } from "@/utils/error";
import { amountInputPreview, toAmountInputValue } from "@/utils/format";
import { toast } from "@/utils/toast";
import type { InsuranceTargetsIn, InsuranceTargetsOut } from "@/types";

/** 정액 보장별 적정 가입금액 기준 편집 — 부부 공유 설정(PUT /settings/insurance-targets). 0은 기준 없음. */
export default function InsuranceTargetsModal({ onClose }: { onClose: () => void }) {
  const settingsQuery = useSettings();
  return (
    <Modal onClose={onClose} title="적정 보장 기준">
      <QueryBoundary query={settingsQuery} errorMessage="설정을 불러오지 못했어요" compact>
        {(settings) => <TargetsForm initial={settings.insurance_targets} onDone={onClose} />}
      </QueryBoundary>
    </Modal>
  );
}

function TargetsForm({ initial, onDone }: { initial: InsuranceTargetsOut; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<InsuranceTargetsIn>(() => {
    const values = { ...initial };
    for (const key of TARGETED_COVERAGES) values[key] = toAmountInputValue(initial[key]);
    return values;
  });
  const mutation = useMutation({
    mutationFn: setInsuranceTargets,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardBootstrap });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.savingsReviewAll });
      toast("기준을 저장했어요.", "success");
      onDone();
    },
    onError: (err) => toast(extractErrorMessage(err), "error"),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const payload = { ...draft };
    for (const key of TARGETED_COVERAGES) payload[key] = payload[key] === "" ? "0" : payload[key];
    mutation.mutate(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex flex-col gap-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        피보험자 1명 기준 합계예요. 이보다 20% 넘게 많으면 감액 후보로, 적으면 &apos;부족&apos;으로 보여드려요. 0이면 비교하지 않아요.
        기본값은 통상적인 가이드일 뿐이니 소득·부양가족·대출에 맞게 바꿔 주세요.
      </p>
      {TARGETED_COVERAGES.map((key) => (
        <FormInput
          key={key}
          label={key === "hospitalization" ? `${COVERAGE_LABEL[key]} (1일)` : COVERAGE_LABEL[key]}
          type="number"
          inputMode="decimal"
          value={draft[key]}
          onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
          className="w-full"
          preview={amountInputPreview(draft[key])}
        />
      ))}
      <Button type="submit" loading={mutation.isPending} className="mt-2">
        저장
      </Button>
    </form>
  );
}
