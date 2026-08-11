import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  header: ReactNode;
  amount?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Collapsible section with a dot/name/amount header row, used for grouped transaction
 * lists (by category, by savings product, ...). Manages its own open/closed state. */
export default function CollapsibleGroup({ header, amount, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-1 min-h-[44px]"
      >
        <div className="flex items-center gap-2 min-w-0">{header}</div>
        <div className="flex items-center gap-1.5 shrink-0">
          {amount !== undefined && (
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{amount}</span>
          )}
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}
