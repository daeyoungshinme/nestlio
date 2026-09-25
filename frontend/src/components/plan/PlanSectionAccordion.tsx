import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import ProgressBar from "@/components/common/ProgressBar";
import { formatKrwCompact, formatPercent } from "@/utils/format";
import { planStatusBarClass, planStatusTextClass, type PlanStatus } from "@/utils/colors";

export interface PlanSection {
  label: string;
  /** 헤더에 보이는 계획 금액(이번 달 계획 또는 연간 목표) */
  planned: number;
  /** 헤더에 보이는 실적 — 아직 집계할 실적이 없으면(미래 기간) null */
  actual: number | null;
  pct: number | null;
  status: PlanStatus | null;
  content: ReactNode;
}

interface Props {
  sections: PlanSection[];
  /** 처음 펼쳐 둘 섹션. 미지정이면 모두 접힌 채로 시작한다. */
  defaultOpenLabel?: string;
}

/** 계획 화면(이번 달/연간 공용)의 섹션 목록. 예전에는 요약카드 4개 + 5개 목적 칩(칩을 눌러야 그 섹션 패널로
 * 전환) + 섹션 패널의 3단 구조였다. 모바일에서 "지금 어디가 부진한지"를 한 번에 훑고 바로 그 자리에서
 * 펼쳐 고칠 수 있도록, 섹션마다 헤더(계획·실적·달성률 막대)와 본문(항목 편집 패널)을 가진 아코디언으로 합쳤다.
 * 여러 섹션을 동시에 펼칠 수 있다. */
export default function PlanSectionAccordion({ sections, defaultOpenLabel }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpenLabel ? [defaultOpenLabel] : []));

  const toggle = (label: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  return (
    <div className="card p-0 divide-y divide-gray-100 dark:divide-gray-800">
      {sections.map((section) => {
        const isOpen = open.has(section.label);
        return (
          <section key={section.label}>
            <button
              type="button"
              onClick={() => toggle(section.label)}
              aria-expanded={isOpen}
              className="w-full px-4 py-3 min-h-[56px] text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                      section.status ? planStatusBarClass(section.status) : "bg-gray-300 dark:bg-gray-600"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">{section.label}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {section.actual !== null ? `${formatKrwCompact(section.actual)} / ` : "계획 "}
                    {formatKrwCompact(section.planned)}
                  </span>
                  <span
                    className={`text-sm font-semibold w-12 text-right ${
                      section.status ? planStatusTextClass(section.status) : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {section.pct !== null ? formatPercent(section.pct) : "–"}
                  </span>
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                </span>
              </div>
              {section.pct !== null && section.status && (
                <div className="mt-2">
                  <ProgressBar pct={section.pct} barClassName={planStatusBarClass(section.status)} />
                </div>
              )}
            </button>
            {isOpen && <div className="px-4 pb-4">{section.content}</div>}
          </section>
        );
      })}
    </div>
  );
}
