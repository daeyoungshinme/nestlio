import type { ReactNode } from "react";
import { Link2, Pencil, Trash2 } from "lucide-react";
import AccountActionsMenu from "@/components/common/AccountActionsMenu";
import type { AccountActionsMenuItem } from "@/components/common/AccountActionsMenu";
import RowActionButtons from "@/components/common/RowActionButtons";
import StatusBadge from "@/components/common/StatusBadge";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import { growlioLinkedBadgeStyle } from "@/utils/colors";

export interface AssetRowAction extends AccountActionsMenuItem {
  /** 데스크톱 아이콘 버튼 hover 색상. 기본은 동기화류(blue), 외부 링크처럼 다른 톤이 필요하면 지정. */
  tone?: "blue" | "emerald";
}

const TONE_HOVER_CLASS: Record<NonNullable<AssetRowAction["tone"]>, string> = {
  blue: "hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950",
  emerald: "hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950",
};

interface Props {
  name: string;
  /** growlio 연동 배지 + "마지막 동기화" 텍스트 표시 여부. */
  linked: boolean;
  /** 이름 배지 줄 아래에 들어가는 유형/소유자/수익률 등 부가 정보. */
  meta: ReactNode;
  /** 금액 표시 영역 (여러 줄 가능). */
  amount: ReactNode;
  /** linked일 때만 렌더링되는 "마지막 동기화 …" 텍스트. */
  syncedAtLabel?: string;
  /** 동기화/외부 링크 등 수정·삭제 이외의 행별 액션. */
  actions?: AssetRowAction[];
  onEdit: () => void;
  onDelete: () => void;
  deleteLabel?: string;
  menuAriaLabel: string;
}

/** 계좌/저축상품/부동산/대출 4개 섹션이 거의 동일하게 반복 구현하던 행(row) 카드 셸.
 * 이름 + growlio 배지, 액션 버튼(데스크톱 아이콘 ⇄ 모바일 ⋯메뉴 이중 렌더링), "마지막 동기화"
 * 텍스트를 여기서 공통 처리하고, 유형별로 다른 배지·본문(meta/amount)만 각 섹션이 조립해서 넘긴다. */
export default function AssetRow({
  name,
  linked,
  meta,
  amount,
  syncedAtLabel,
  actions = [],
  onEdit,
  onDelete,
  deleteLabel = "삭제",
  menuAriaLabel,
}: Props) {
  const menuItems: AccountActionsMenuItem[] = [
    ...actions,
    { icon: <Pencil size={16} />, label: "수정", onClick: onEdit },
    { icon: <Trash2 size={16} />, label: deleteLabel, onClick: onDelete, variant: "danger" },
  ];

  return (
    <div className="card p-4 sm:p-5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate flex-1 min-w-0">{name}</p>
          {linked && (
            <StatusBadge
              size="chip"
              icon={<Link2 size={11} />}
              label="growlio 연동"
              toneClassName={growlioLinkedBadgeStyle()}
              className="shrink-0"
            />
          )}
        </div>
        {meta}
        {amount}
        {linked && syncedAtLabel && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{syncedAtLabel}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <div className="hidden sm:flex items-center gap-1">
          {actions.map((action, i) => {
            const className = `${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 ${TONE_HOVER_CLASS[action.tone ?? "blue"]} rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center`;
            return action.href ? (
              <a
                key={i}
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                title={action.label}
                aria-label={action.label}
                className={className}
              >
                {action.icon}
              </a>
            ) : (
              <button
                key={i}
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.label}
                aria-label={action.label}
                className={className}
              >
                {action.icon}
              </button>
            );
          })}
          <RowActionButtons onEdit={onEdit} onDelete={onDelete} deleteLabel={deleteLabel} />
        </div>
        <div className="sm:hidden">
          <AccountActionsMenu items={menuItems} ariaLabel={menuAriaLabel} />
        </div>
      </div>
    </div>
  );
}
