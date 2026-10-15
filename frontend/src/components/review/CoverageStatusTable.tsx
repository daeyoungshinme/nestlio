import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import Button from "@/components/common/Button";
import Tabs from "@/components/common/Tabs";
import InsuranceTargetsModal from "@/components/review/InsuranceTargetsModal";
import { COVERAGE_STATUS_LABEL, coverageLabel } from "@/constants/insurance";
import { coverageStatusBadgeClass } from "@/utils/colors";
import { formatKrw } from "@/utils/format";
import type { CoverageStatusOut } from "@/types";

function amount(coverage: string, value: string): string {
  return coverage === "hospitalization" ? `1일 ${formatKrw(value)}` : formatKrw(value);
}

/** 피보험자별 정액 보장 합계 vs 적정 기준 — 과다는 감액 후보, 부족은 줄이지 말 곳. 입력한 특약 기준이다. */
export default function CoverageStatusTable({ rows }: { rows: CoverageStatusOut[] }) {
  const people = [...new Set(rows.map((r) => r.insured_label))];
  const [person, setPerson] = useState(people[0] ?? "");
  const [editingTargets, setEditingTargets] = useState(false);
  const active = people.includes(person) ? person : (people[0] ?? "");
  const visible = rows.filter((r) => r.insured_label === active);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">보장 현황 (입력한 특약 기준)</h3>
        <Button size="sm" variant="ghost" icon={<SlidersHorizontal size={14} />} onClick={() => setEditingTargets(true)}>
          기준 조정
        </Button>
      </div>
      {people.length > 1 && <Tabs tabs={people} activeTab={active} onChange={setPerson} variant="underline" />}
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {visible.map((row) => (
          <li key={row.coverage} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-50">{coverageLabel(row.coverage)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {amount(row.coverage, row.total_amount)}
                {Number(row.target_amount) > 0 ? ` / 기준 ${amount(row.coverage, row.target_amount)}` : ""}
                {row.rider_count > 0 ? ` · 특약 ${row.rider_count}개` : ""}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${coverageStatusBadgeClass(row.status)}`}>
              {COVERAGE_STATUS_LABEL[row.status]}
            </span>
          </li>
        ))}
      </ul>
      {editingTargets && <InsuranceTargetsModal onClose={() => setEditingTargets(false)} />}
    </div>
  );
}
