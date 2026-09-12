import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import FormInput from "@/components/common/FormInput";
import { SettingsSectionCard, onMutationError } from "@/components/settings/shared";
import { setCoachingThresholds } from "@/api/settings";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { COACHING_THRESHOLD_PRESETS } from "@/constants/coachingPresets";
import { toast } from "@/utils/toast";
import type { CoachingThresholdsOut } from "@/types";

const THRESHOLD_FIELDS: { key: keyof CoachingThresholdsOut; label: string }[] = [
  { key: "savings_rate_warn", label: "저축률 경고" },
  { key: "savings_rate_critical", label: "저축률 위험" },
  { key: "fixed_cost_ratio_warn", label: "고정비율 경고" },
  { key: "fixed_cost_ratio_critical", label: "고정비율 위험" },
  { key: "budget_warn_pct", label: "예산 경고" },
  { key: "budget_critical_pct", label: "예산 위험" },
  { key: "discretionary_ratio_warn", label: "재량지출 경고" },
  { key: "debt_ratio_warn", label: "부채비율 경고" },
  { key: "benchmark_food_warn_pct", label: "식비 가이드라인" },
  { key: "benchmark_housing_warn_pct", label: "주거/공과금 가이드라인" },
  { key: "benchmark_communication_warn_pct", label: "통신비 가이드라인" },
  { key: "benchmark_transport_warn_pct", label: "교통비 가이드라인" },
  { key: "benchmark_leisure_warn_pct", label: "여가/문화 가이드라인" },
  { key: "benchmark_healthcare_warn_pct", label: "의료/건강 가이드라인" },
  { key: "benchmark_education_warn_pct", label: "교육 가이드라인" },
  { key: "benchmark_insurance_warn_pct", label: "보험 가이드라인" },
];

export default function CoachingThresholdsSection({ thresholds }: { thresholds: CoachingThresholdsOut }) {
  const queryClient = useQueryClient();
  const [thresholdEdits, setThresholdEdits] = useState<Partial<CoachingThresholdsOut>>({});

  const thresholdsMutation = useMutation({
    mutationFn: setCoachingThresholds,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardBootstrap });
      setThresholdEdits({});
      toast("코칭 임계값을 저장했습니다.", "success");
    },
    onError: onMutationError,
  });

  return (
    <SettingsSectionCard title="고급 설정">
      <CollapsibleGroup
        header={<span className="text-sm font-semibold text-gray-700 dark:text-gray-300">코칭 민감도</span>}
        defaultOpen={false}
      >
        <p className="text-xs text-gray-500 dark:text-gray-400">
          대시보드 코칭 인사이트가 발동하는 기준(%)이에요. 두 분의 소비 성향에 맞게 프리셋 하나를 고르거나,
          아래에서 항목별로 직접 조정하세요.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {COACHING_THRESHOLD_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setThresholdEdits(preset.values)}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <CollapsibleGroup
          header={<span className="text-xs font-medium text-gray-500 dark:text-gray-400">직접 조정 (16개 항목)</span>}
          defaultOpen={false}
        >
          <div className="grid grid-cols-2 gap-3">
            {THRESHOLD_FIELDS.map(({ key, label }) => (
              <FormInput
                key={key}
                label={label}
                type="number"
                min={0}
                max={999}
                step={1}
                value={thresholdEdits[key] ?? thresholds[key]}
                onChange={(e) => setThresholdEdits((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
              />
            ))}
          </div>
        </CollapsibleGroup>

        <Button
          size="sm"
          disabled={Object.keys(thresholdEdits).length === 0}
          loading={thresholdsMutation.isPending}
          onClick={() => thresholdsMutation.mutate({ ...thresholds, ...thresholdEdits })}
        >
          저장
        </Button>
      </CollapsibleGroup>
    </SettingsSectionCard>
  );
}
