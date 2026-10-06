/** API 금액(Decimal 문자열)을 합산한다 — `.reduce((sum, x) => sum + Number(x.f), 0)`가 컴포넌트마다
 * 흩어져 있던 것을 한 곳으로. 목록이 아직 없으면(undefined/null) 0. 원 단위 정수 금액이라 Number
 * 합산의 정밀도 문제는 없지만(2^53 원), 금액 연산 방식을 바꿀 때 이 함수 하나만 고치면 된다. */
export function sumAmounts<T>(
  items: readonly T[] | null | undefined,
  pick: (item: T) => string | number | null | undefined,
): number {
  if (!items) return 0;
  let total = 0;
  for (const item of items) total += Number(pick(item) ?? 0);
  return total;
}
