import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, ShieldCheck } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";
import InlineStatsBar from "@/components/common/InlineStatsBar";
import QueryBoundary from "@/components/common/QueryBoundary";
import AssetRow from "@/components/accounts/AssetRow";
import CoverageStatusTable from "@/components/review/CoverageStatusTable";
import InsurancePolicyFormModal from "@/components/review/InsurancePolicyFormModal";
import ReviewFindingCard from "@/components/review/ReviewFindingCard";
import {
  createInsurancePolicy,
  deactivateInsurancePolicy,
  fetchInsurancePolicies,
  updateInsurancePolicy,
} from "@/api/insurance";
import { COVERAGE_LABEL, PAYMENT_FREQUENCY_LABEL, POLICY_TYPE_LABEL, coverageLabel } from "@/constants/insurance";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { useUsers } from "@/hooks/useReferenceData";
import { cautionCalloutClass, cautionCalloutTextClass } from "@/utils/colors";
import { formatKrw, formatPercent } from "@/utils/format";
import type { InsurancePolicyIn, InsurancePolicyOut, InsuranceReviewOut, UserOut } from "@/types";

const INVALIDATE_KEYS = [QUERY_KEYS.insurancePolicies, QUERY_KEYS.savingsReviewAll];

export default function InsuranceReviewSection({ data }: { data: InsuranceReviewOut }) {
  const [formTarget, setFormTarget] = useState<"new" | InsurancePolicyOut | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<number | null>(null);
  const { data: users } = useUsers();
  const policiesQuery = useQuery({ queryKey: QUERY_KEYS.insurancePolicies, queryFn: fetchInsurancePolicies });

  const { createMutation, updateMutation, removeMutation } = useCrudMutations({
    invalidateKeys: INVALIDATE_KEYS,
    api: { create: createInsurancePolicy, update: updateInsurancePolicy, remove: deactivateInsurancePolicy },
    messages: { create: "보험을 추가했어요.", update: "저장했어요.", remove: "해지·만기 처리했어요." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });

  const handleSubmit = (payload: InsurancePolicyIn) => {
    if (formTarget === "new") createMutation.mutate(payload);
    else if (formTarget) updateMutation.mutate({ id: formTarget.id, payload });
  };

  const { summary } = data;
  const incomePct =
    summary.protection_income_pct === null
      ? "소득 기록 없음"
      : `${formatPercent(summary.protection_income_pct, 1)} (기준 ${formatPercent(summary.guideline_pct)})`;

  return (
    <div className="space-y-4">
      <p className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${cautionCalloutClass()} ${cautionCalloutTextClass()}`}>
        정보 제공용 점검이에요. 보험은 해지하면 나이·병력 때문에 다시 가입하기 어렵거나 보장 공백이 생길 수 있으니, 해지 전에
        재가입 가능 여부와 면책기간을 꼭 확인하세요. 특약만 해지·감액하는 건 보험사마다 가능 여부가 다르니 해약환급금과 함께
        먼저 물어보세요.
      </p>

      {summary.policies_count > 0 && (
        <InlineStatsBar
          items={[
            { label: "월 보험료", value: formatKrw(summary.total_monthly_premium), tone: "negative" },
            { label: "보장성 소득 대비", value: incomePct },
            ...(Number(summary.savings_monthly_premium) > 0
              ? [{ label: "저축성", value: formatKrw(summary.savings_monthly_premium) }]
              : []),
            ...summary.by_insured.map((p) => ({ label: `${p.label} (${p.count}건)`, value: formatKrw(p.monthly_premium) })),
          ]}
        />
      )}

      {data.findings.length > 0 && (
        <div className="space-y-2">
          {data.findings.map((f) => (
            <ReviewFindingCard
              key={`${f.rule_code}-${f.title}`}
              severity={f.severity}
              title={f.title}
              detail={f.detail}
              saving={f.estimated_monthly_saving}
            />
          ))}
        </div>
      )}

      {summary.coverage_table.length > 0 ? (
        <CoverageStatusTable rows={summary.coverage_table} />
      ) : (
        summary.policies_count > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            보험을 수정해 주요 특약(보장·가입금액·보험료)을 넣으면 보장 과다·부족과 감액 시 절감액을 계산해 드려요.
          </p>
        )
      )}

      {summary.top_riders.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">보험료가 큰 특약</h3>
          <ul className="space-y-1.5">
            {summary.top_riders.map((r) => (
              <li key={`${r.policy_name}-${r.rider_name}`} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-gray-700 dark:text-gray-300">
                  {r.rider_name}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {" "}
                    · {r.policy_name} · {coverageLabel(r.coverage)}
                    {r.is_renewable ? " · 갱신형" : ""}
                  </span>
                </span>
                <span className="shrink-0 font-semibold text-gray-900 dark:text-gray-50">월 {formatKrw(r.monthly_premium)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">가입한 보험</p>
        <Button size="sm" icon={<Plus size={14} />} onClick={() => setFormTarget("new")}>
          보험 추가
        </Button>
      </div>

      <QueryBoundary query={policiesQuery} errorMessage="보험 목록을 불러오지 못했어요" compact>
        {(policies) =>
          policies.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="등록된 보험이 없어요"
              description="보험증권이나 보험사 앱을 보고 하나씩 추가하면 중복 가입·갱신 시기를 점검해 드려요."
              compact
            />
          ) : (
            <div className="space-y-2">
              {policies.map((policy) => (
                <PolicyRow
                  key={policy.id}
                  policy={policy}
                  users={users}
                  onEdit={() => setFormTarget(policy)}
                  onDelete={() => setDeactivateTarget(policy.id)}
                />
              ))}
            </div>
          )
        }
      </QueryBoundary>

      {formTarget && (
        <InsurancePolicyFormModal
          policy={formTarget === "new" ? null : formTarget}
          users={users}
          submitting={createMutation.isPending || updateMutation.isPending}
          onClose={() => setFormTarget(null)}
          onSubmit={handleSubmit}
        />
      )}

      {deactivateTarget !== null && (
        <ConfirmModal
          message="해지했거나 만기된 보험인가요? 목록과 점검에서 빠져요."
          confirmLabel="해지·만기 처리"
          onConfirm={() => removeMutation.mutate(deactivateTarget)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </div>
  );
}

function insuredLabel(policy: InsurancePolicyOut, users: UserOut[] | undefined): string {
  if (policy.insured_user_id) return users?.find((u) => u.id === policy.insured_user_id)?.display_name ?? "알 수 없음";
  return policy.insured_name || "피보험자 미지정";
}

function PolicyRow({
  policy,
  users,
  onEdit,
  onDelete,
}: {
  policy: InsurancePolicyOut;
  users: UserOut[] | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const coverages = policy.coverages.map((c) => COVERAGE_LABEL[c]).join(" · ");
  const renewableRiders = policy.riders.filter((r) => r.is_renewable).length;
  return (
    <AssetRow
      name={policy.name}
      linked={false}
      meta={
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {POLICY_TYPE_LABEL[policy.policy_type]} · {insuredLabel(policy, users)}
          {policy.is_renewable ? " · 갱신형" : ""}
          {policy.riders.length > 0
            ? ` · 특약 ${policy.riders.length}개${renewableRiders > 0 ? `(갱신형 ${renewableRiders})` : ""}`
            : ""}
          {coverages ? ` · ${coverages}` : ""}
        </p>
      }
      amount={
        <>
          <p className="mt-1 text-base font-bold text-gray-900 dark:text-gray-50">월 {formatKrw(policy.monthly_premium)}</p>
          {policy.payment_frequency === "yearly" && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {PAYMENT_FREQUENCY_LABEL.yearly} {formatKrw(policy.premium_amount)}
            </p>
          )}
        </>
      }
      onEdit={onEdit}
      onDelete={onDelete}
      deleteLabel="해지·만기"
      menuAriaLabel={`${policy.name} 작업 더 보기`}
    />
  );
}
