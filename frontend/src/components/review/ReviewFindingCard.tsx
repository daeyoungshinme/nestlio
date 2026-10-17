import { Link } from "react-router-dom";
import { TOUCH_TARGET_MIN_HEIGHT } from "@/constants/uiSizes";
import { insightSeverityStyle } from "@/utils/colors";
import { formatKrw } from "@/utils/format";
import type { InsightSeverityLevel } from "@/types";

interface Props {
  severity: InsightSeverityLevel;
  title: string;
  detail: string;
  saving: string;
  related?: string[];
  link?: { to: string; label: string };
}

/** 절감 점검의 한 줄 결과 — 소비 후보와 보험 점검 결과가 같은 카드를 쓴다. 절감 추정이 0이면(확인만 필요한 항목) 금액을 숨긴다. */
export default function ReviewFindingCard({ severity, title, detail, saving, related = [], link }: Props) {
  const hasSaving = Number(saving) > 0;
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm space-y-1.5 ${insightSeverityStyle(severity)}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold">{title}</p>
        {hasSaving && <p className="shrink-0 font-bold whitespace-nowrap">월 -{formatKrw(saving)}</p>}
      </div>
      <p className="text-xs leading-relaxed opacity-90">{detail}</p>
      {related.length > 0 && (
        <ul className="text-xs opacity-80 list-disc pl-4">
          {related.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {link && (
        <Link to={link.to} className={`text-xs font-semibold underline hover:no-underline ${TOUCH_TARGET_MIN_HEIGHT} inline-flex items-center`}>
          {link.label}
        </Link>
      )}
    </div>
  );
}
