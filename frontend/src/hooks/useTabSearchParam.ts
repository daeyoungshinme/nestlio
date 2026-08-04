import { useSearchParams } from "react-router-dom";

/** Syncs a page's active tab to the `?tab=` search param (falls back to `defaultTab`
 * for missing/unknown values, e.g. a stale deep link to a since-removed tab). */
export function useTabSearchParam<T extends string>(tabs: readonly T[], defaultTab: T) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab: T = (tabs as readonly string[]).includes(rawTab ?? "") ? (rawTab as T) : defaultTab;

  const setTab = (next: T) => {
    setSearchParams(
      (prev) => {
        prev.set("tab", next);
        return prev;
      },
      { replace: true },
    );
  };

  return [tab, setTab] as const;
}
