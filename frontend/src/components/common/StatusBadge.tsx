import type { ReactNode } from "react";

interface Props {
  label: string;
  toneClassName: string;
  icon?: ReactNode;
  className?: string;
  /** "pill"(기본): 둥근 알약형, 여백이 넓은 상태 배지용. "chip": 각진 모서리의 더 작은 태그형,
   *  자산 목록 등 조밀하게 나열되는 곳에서 쓴다. */
  size?: "pill" | "chip";
  title?: string;
}

const SIZE_CLASS: Record<"pill" | "chip", string> = {
  pill: "px-2 py-0.5 rounded-full text-xs",
  chip: "px-1.5 py-0.5 rounded text-[11px]",
};

/** 색상 배지의 공용 마크업 — `Badge`(카테고리/거래유형 전용)와 재무목표·챌린지 진행카드의
 * 상태/연동 배지가 함께 쓴다. 톤은 항상 utils/colors.ts를 거쳐 호출부에서 전달한다. */
export default function StatusBadge({ label, toneClassName, icon, className, size = "pill", title }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-medium ${SIZE_CLASS[size]} ${toneClassName} ${className ?? ""}`}
      title={title}
    >
      {icon}
      {label}
    </span>
  );
}
