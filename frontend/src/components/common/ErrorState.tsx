import { AlertTriangle } from "lucide-react";

interface Props {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

export default function ErrorState({ title = "불러오지 못했습니다", message, onRetry, compact, className }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-4 ${compact ? "py-6" : "py-12"} ${className ?? ""}`}
    >
      <AlertTriangle size={40} className="mb-3 text-red-300 dark:text-red-800" />
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
      {message && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{message}</p>}
      {onRetry && (
        <button onClick={onRetry} className="mt-3 text-sm text-primary dark:text-primary-400 hover:underline">
          다시 시도
        </button>
      )}
    </div>
  );
}
