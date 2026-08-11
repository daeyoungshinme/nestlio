import type { ReactNode } from "react";

interface Props {
  label: string;
  toneClassName: string;
  icon?: ReactNode;
  className?: string;
}

/** 색상 pill 배지의 공용 마크업 — `Badge`(카테고리/거래유형 전용)와 재무목표·챌린지 진행카드의
 * 상태/연동 배지가 함께 쓴다. 톤은 항상 utils/colors.ts를 거쳐 호출부에서 전달한다. */
export default function StatusBadge({ label, toneClassName, icon, className }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${toneClassName} ${className ?? ""}`}
    >
      {icon}
      {label}
    </span>
  );
}
