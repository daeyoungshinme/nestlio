import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/** 쿼리 파라미터(`?tab=`·`?view=` 등)로 고른 탭. 값이 목록에 없으면 기본 탭. 바꾸면 그 파라미터만 고치고(다른
 * 파라미터 유지) 히스토리를 쌓지 않는다(replace) — 탭을 오갈 때마다 뒤로가기가 늘지 않게.
 *
 * - `legacyKeys`: 예전 딥링크 파라미터 이름. 앞의 이름부터 처음 있는 값 하나만 본다(`?section=` → 구 `?tab=`).
 * - `pinDefault`: 파라미터 없이 들어오면 기본 탭을 URL에 써 둔다 — 뒤로가기·공유 때 같은 화면이 열리게. */
export function useTabParam<T extends string>(
  key: string,
  tabs: readonly T[],
  defaultTab: T,
  { legacyKeys = [], pinDefault = false }: { legacyKeys?: string[]; pinDefault?: boolean } = {},
): [T, (next: T) => void, boolean] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = [key, ...legacyKeys].map((k) => searchParams.get(k)).find((v) => v !== null) ?? null;
  const isValid = (tabs as readonly string[]).includes(raw ?? "");
  const active = isValid ? (raw as T) : defaultTab;

  const change = (next: T) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set(key, next);
        return params;
      },
      { replace: true },
    );

  useEffect(() => {
    if (pinDefault && !isValid) change(defaultTab);
    // eslint-disable-next-line react/exhaustive-deps -- 마운트 시 1회만 기본값을 URL에 채운다
  }, []);

  // 세 번째 값: URL에 유효한 탭이 적혀 들어왔는지(딥링크로 그 탭을 스크롤해 보여 줄 때 쓴다).
  return [active, change, isValid];
}
