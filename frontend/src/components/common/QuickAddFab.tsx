import { Plus } from "lucide-react";

interface QuickAddFabProps {
  onClick: () => void;
  label?: string;
}

export default function QuickAddFab({ onClick, label = "내역 빠르게 추가" }: QuickAddFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 lg:bottom-6 z-30 flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg transition-colors active:scale-[0.97]"
      aria-label={label}
      title={label}
    >
      <Plus size={24} aria-hidden="true" />
    </button>
  );
}
