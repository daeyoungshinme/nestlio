import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import CollapsibleGroup from "@/components/common/CollapsibleGroup";
import FormInput from "@/components/common/FormInput";
import { SettingsLinkRow, SettingsSectionCard } from "@/components/settings/shared";
import { setCoachingThresholds } from "@/api/settings";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { ROUTES } from "@/constants/routes";
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
  const [activePresetKey, setActivePresetKey] = useState<string | null>(null);
  const hasEdits = Object.keys(thresholdEdits).length > 0;

  const thresholdsMutation = useMutation({
    mutationFn: setCoachingThresholds,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardBootstrap });
      // 연간 리포트의 벤치마크 비교도 이 임계값으로 계산된다(routers/reports.py).
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.yearlyReportAll });
      setThresholdEdits({});
      setActivePresetKey(null);
      toast("코칭 임계값을 저장했습니다.", "success");
    },
  });

  return (
    // "고급"은 자주 안 쓰는 것만 — 메뉴에 없는 카테고리 관리·거래 데이터의 유일한 진입점도 여기다
    // (예전 "바로가기" 카드의 나머지 링크는 다른 화면과 중복이라 뺐다).
    <SettingsSectionCard title="고급">
      <div className="space-y-1">
        <SettingsLinkRow to={ROUTES.categories} label="카테고리 관리" hint="고정·변동·비정기지출 카테고리 추가/수정" />
        <SettingsLinkRow to={ROUTES.transactionImport} label="거래 데이터" hint="CSV 가져오기 / 내보내기" />
      </div>
      <CollapsibleGroup
        header={<span className="text-sm font-semibold text-gray-700 dark:text-gray-300">코칭 민감도</span>}
        defaultOpen={false}
      >
        <p className="text-xs text-gray-500 dark:text-gray-400">
          홈 코칭이 뜨는 기준(%)이에요. 프리셋을 고르거나 항목별로 조정하세요.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {COACHING_THRESHOLD_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              variant={activePresetKey === preset.key ? "primary" : "secondary"}
              size="sm"
              aria-pressed={activePresetKey === preset.key}
              onClick={() => {
                setThresholdEdits(preset.values);
                setActivePresetKey(preset.key);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        {/* 한 단계 더 접던 "직접 조정"을 펼쳐 둔다 — 프리셋을 눌러도 값이 바뀌는 게 보이도록. 모바일은 1열. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {THRESHOLD_FIELDS.map(({ key, label }) => (
            <FormInput
              key={key}
              label={label}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={thresholdEdits[key] ?? thresholds[key]}
              onChange={(e) => {
                setThresholdEdits((prev) => ({ ...prev, [key]: Number(e.target.value) }));
                setActivePresetKey(null);
              }}
            />
          ))}
        </div>
        {hasEdits && <p className="text-xs text-gray-500 dark:text-gray-400">저장하면 적용돼요.</p>}

        <Button
          size="sm"
          disabled={!hasEdits}
          loading={thresholdsMutation.isPending}
          onClick={() => thresholdsMutation.mutate({ ...thresholds, ...thresholdEdits })}
        >
          저장
        </Button>
      </CollapsibleGroup>
    </SettingsSectionCard>
  );
}
