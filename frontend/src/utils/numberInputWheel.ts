/** 포커스된 `<input type="number">` 위에서 마우스 휠을 굴리면 브라우저가 값을 ±1씩 바꿔
 * 금액이 조용히 틀어진다(데스크톱 Chrome/Edge). 휠 이벤트가 그 입력칸에서 났으면 포커스를 풀어
 * 값 변경 대신 페이지 스크롤로 넘긴다. 숫자 입력칸이 30곳 넘게 흩어져 있어(FormInput을 거치지
 * 않는 raw input 포함) 개별 onWheel 대신 문서 단위로 한 번만 건다. */
export function handleNumberInputWheel(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === "number" && target === document.activeElement) {
    target.blur();
  }
}

export function installNumberInputWheelGuard(doc: Document = document): () => void {
  doc.addEventListener("wheel", handleNumberInputWheel, { passive: true });
  return () => doc.removeEventListener("wheel", handleNumberInputWheel);
}
