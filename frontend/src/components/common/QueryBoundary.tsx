import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import ErrorState from "./ErrorState";
import SkeletonCard from "./SkeletonCard";
import { extractErrorMessage } from "@/utils/error";

/** `useQuery` 결과의 로딩/에러 분기를 한 곳으로 모은 래퍼. 페이지마다 반복하던
 * `if (isError) return <ErrorState/>; if (isLoading || !data) return <SkeletonCard/>;` 관용구를 대체한다.
 *
 * - 단일 쿼리: `query` prop + render-prop children — children이 확정된 `data`를 인자로 받는다.
 * - 다중 쿼리: `queries` 배열 + children — 하나라도 데이터가 없으면 폴백, 하나라도 에러면 ErrorState.
 *   `data`의 속성을 읽는 내용은 반드시 render-prop(`{() => ...}`)으로 넘긴다. 일반 children은 boundary가
 *   판단하기 전에 부모 렌더에서 평가되므로 `query.data!.field`가 그 자리에서 터진다. */
interface BaseProps {
  /** 로딩 중 표시할 요소. 기본값 `<SkeletonCard rows={4} />`. */
  loadingFallback?: ReactNode;
  /** 에러 시 `extractErrorMessage`에 넘길 fallback 문구. */
  errorMessage?: string;
  /** `ErrorState`의 compact 스타일 사용 여부. */
  compact?: boolean;
}

interface SingleQueryProps<T> extends BaseProps {
  query: UseQueryResult<T>;
  queries?: never;
  children: (data: T) => ReactNode;
}

interface MultiQueryProps extends BaseProps {
  queries: UseQueryResult<unknown>[];
  query?: never;
  children: ReactNode | (() => ReactNode);
}

export default function QueryBoundary<T>(props: SingleQueryProps<T> | MultiQueryProps) {
  const { loadingFallback = <SkeletonCard rows={4} />, errorMessage, compact } = props;
  const list = props.query ? [props.query] : props.queries;

  const errored = list.find((q) => q.isError);
  if (errored) {
    return (
      <ErrorState
        message={extractErrorMessage(errored.error, errorMessage)}
        compact={compact}
        onRetry={() => list.forEach((q) => void q.refetch())}
      />
    );
  }

  if (props.query) {
    if (props.query.data === undefined) return <>{loadingFallback}</>;
    return <>{props.children(props.query.data)}</>;
  }

  // isLoading이 아니라 data로 본다 — 오프라인으로 멈춘 쿼리는 isLoading이 false인데 data도 없다.
  if (props.queries.some((q) => q.data === undefined)) return <>{loadingFallback}</>;
  return <>{typeof props.children === "function" ? props.children() : props.children}</>;
}
