import { useEffect, useLayoutEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/** 일회성 딥링크 파라미터(`?date=`, `?recurring=` 등)를 읽어 처리한 뒤 URL에서 지운다(replace — 뒤로가기에
 * 남지 않음). 값이 바뀔 때마다 한 번씩 `onValue`를 부르고, 값이 없으면 아무것도 하지 않는다. 처리할 수 없는 값도
 * 지운다(남겨 두면 새로고침마다 같은 잘못된 링크를 다시 읽는다). `onValue`는 최신 렌더의 것을 쓴다. */
export function useConsumeSearchParam(name: string, onValue: (value: string) => void) {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(name);
  const onValueRef = useRef(onValue);
  const setSearchParamsRef = useRef(setSearchParams);
  useLayoutEffect(() => {
    onValueRef.current = onValue;
    setSearchParamsRef.current = setSearchParams;
  });

  useEffect(() => {
    if (value === null) return;
    onValueRef.current(value);
    setSearchParamsRef.current(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(name);
        return next;
      },
      { replace: true },
    );
  }, [name, value]);
}
