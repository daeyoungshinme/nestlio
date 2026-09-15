import ProgressBar from "@/components/common/ProgressBar";
import { PAYMENT_METHOD_LABEL } from "@/constants/transactions";
import { insightSeverityStyle } from "@/utils/colors";
import { formatKrw } from "@/utils/format";
import type { PaymentMethodAmountOut } from "@/types";

interface Props {
  paymentMethodBreakdown: PaymentMethodAmountOut[];
}

/** 신용카드 비중이 이 이상이면 체크카드 전환을 권하는 안내를 보여준다.
 * 코칭엔진 임계값(app/config.py)과 달리 부부가 조정하는 설정값이 아니라, 이 카드 전용 고정
 * 기준선이다 — 데이터가 쌓인 뒤 정식 코칭 인사이트로 승격할 때 설정 가능한 임계값으로 옮긴다. */
const CREDIT_CARD_RATIO_NOTICE_PCT = 50;

export default function PaymentMethodBreakdownCard({ paymentMethodBreakdown: rawBreakdown }: Props) {
  const rows = (rawBreakdown ?? []).filter((row) => Number(row.amount) > 0);
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);
  if (total <= 0) return null;

  const sorted = [...rows].sort((a, b) => Number(b.amount) - Number(a.amount));
  const creditCardRow = rows.find((row) => row.payment_method === "credit_card");
  const creditCardPct = creditCardRow ? (Number(creditCardRow.amount) / total) * 100 : 0;

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 dark:text-gray-300">이번 달 결제수단별 지출</span>
      </div>

      <div className="space-y-2">
        {sorted.map((row) => {
          const pct = (Number(row.amount) / total) * 100;
          return (
            <div key={row.payment_method ?? "unspecified"}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-600 dark:text-gray-300">
                  {row.payment_method ? PAYMENT_METHOD_LABEL[row.payment_method] : "미입력"}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {formatKrw(row.amount)} ({pct.toFixed(0)}%)
                </span>
              </div>
              <ProgressBar pct={pct} />
            </div>
          );
        })}
      </div>

      {creditCardPct >= CREDIT_CARD_RATIO_NOTICE_PCT && (
        <div className={`rounded-lg px-2.5 py-1.5 text-xs border ${insightSeverityStyle("warning")}`}>
          신용카드 사용 비중이 {creditCardPct.toFixed(0)}%예요 — 체크카드로 조금씩 옮겨보면 지출 관리에 도움이 돼요.
        </div>
      )}
    </div>
  );
}
