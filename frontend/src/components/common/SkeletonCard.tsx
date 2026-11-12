/** `bare`면 카드 테두리 없이 줄만 그린다 — 이미 카드인 위젯 안의 목록 자리에 쓴다. */
export default function SkeletonCard({
  rows = 3,
  height = "h-4",
  bare = false,
}: {
  rows?: number;
  height?: string;
  bare?: boolean;
}) {
  return (
    <div className={`${bare ? "" : "card "}space-y-3`} role="status" aria-label="로딩 중" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`${height} bg-gray-200 dark:bg-gray-700 rounded-sm animate-pulse`}
          style={{ width: `${80 - i * 10}%` }}
        />
      ))}
    </div>
  );
}
