import { useEffect, useState } from "react";

/** iOS Safari 등에서 소프트 키보드가 뜨면 window.innerHeight는 그대로지만 visualViewport.height만
 * 줄어든다 — 모달이 이 값을 반영하지 못하면 키보드가 입력 필드나 하단 버튼을 가린다.
 * visualViewport API 미지원 브라우저에서는 null을 반환해 호출부가 정적 폴백(dvh 단위)을 쓰도록 한다. */
export function useVisualViewportHeight() {
  const [height, setHeight] = useState<number | null>(
    () => window.visualViewport?.height ?? null,
  );

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setHeight(vv.height);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return height;
}
