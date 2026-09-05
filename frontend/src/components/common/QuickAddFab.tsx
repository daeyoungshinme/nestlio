import { Plus } from "lucide-react";
import type { CSSProperties } from "react";
import { BOTTOM_NAV_HEIGHT_PX } from "@/constants/uiSizes";
import { Z_FAB } from "@/constants/zIndex";

interface QuickAddFabProps {
  onClick: () => void;
  label?: string;
}

const FAB_BOTTOM_STYLE = {
  "--fab-bottom-mobile": `calc(${BOTTOM_NAV_HEIGHT_PX}px + 1rem + env(safe-area-inset-bottom))`,
} as CSSProperties;

export default function QuickAddFab({ onClick, label = "내역 빠르게 추가" }: QuickAddFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={FAB_BOTTOM_STYLE}
      className={`fixed bottom-[var(--fab-bottom-mobile)] right-4 lg:bottom-6 ${Z_FAB} flex items-center justify-center w-14 h-14 rounded-full bg-primary hover:bg-primary-700 text-white shadow-lg transition-colors active:scale-[0.97]`}
      aria-label={label}
      title={label}
    >
      <Plus size={24} aria-hidden="true" />
    </button>
  );
}
