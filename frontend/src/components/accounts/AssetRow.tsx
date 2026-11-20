import type { ReactNode } from "react";
import { Link2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import AccountActionsMenu from "@/components/common/AccountActionsMenu";
import type { AccountActionsMenuItem } from "@/components/common/AccountActionsMenu";
import RowActionButtons from "@/components/common/RowActionButtons";
import StatusBadge from "@/components/common/StatusBadge";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import { growlioLinkedBadgeStyle } from "@/utils/colors";
import { formatSyncedAt } from "@/utils/format";

type AssetRowAction = AccountActionsMenuItem;

const ACTION_HOVER_CLASS = "hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950";

interface Props {
  name: string;
  /** growlio 연동 배지 + "마지막 동기화" 텍스트 표시 여부. */
  linked: boolean;
  /** 이름 배지 줄 아래에 들어가는 유형/소유자/수익률 등 부가 정보. */
  meta: ReactNode;
  /** 금액 표시 영역 (여러 줄 가능). */
  amount: ReactNode;
  /** growlio 마지막 동기화 시각 — linked일 때 "마지막 동기화 …"/"아직 동기화하지 않았어요"로 보여준다. */
  lastSyncedAt?: string | null;
  /** linked일 때 맨 앞에 붙는 행 단위 growlio 동기화 버튼. label 기본값 "growlio 동기화". */
  sync?: { onSync: () => void; pending: boolean; label?: string };
  /** 외부 링크 등 동기화·수정·삭제 이외의 행별 액션. */
  actions?: AssetRowAction[];
  onEdit: () => void;
  onDelete: () => void;
  deleteLabel?: string;
  menuAriaLabel: string;
}

/** 계좌/저축상품/부동산/대출 4개 섹션이 거의 동일하게 반복 구현하던 행(row) 카드 셸.
 * 이름 + growlio 배지, 액션 버튼(데스크톱 아이콘 ⇄ 모바일 ⋯메뉴 이중 렌더링), growlio 동기화 버튼과 "마지막 동기화"
 * 텍스트를 여기서 공통 처리하고, 유형별로 다른 배지·본문(meta/amount)만 각 섹션이 조립해서 넘긴다. */
export default function AssetRow({
  name,
  linked,
  meta,
  amount,
  lastSyncedAt,
  sync,
  actions: extraActions = [],
  onEdit,
  onDelete,
  deleteLabel = "삭제",
  menuAriaLabel,
}: Props) {
  const actions: AssetRowAction[] = [
    ...(linked && sync
      ? [
          {
            icon: <RefreshCw size={16} className={sync.pending ? "animate-spin" : ""} />,
            label: sync.pending ? "동기화 중…" : (sync.label ?? "growlio 동기화"),
            onClick: sync.onSync,
            disabled: sync.pending,
          },
        ]
      : []),
    ...extraActions,
  ];
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
        {linked && lastSyncedAt !== undefined && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
            {lastSyncedAt ? `마지막 동기화 ${formatSyncedAt(lastSyncedAt)}` : "아직 동기화하지 않았어요"}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <div className="hidden sm:flex items-center gap-1">
          {actions.map((action, i) => {
            const className = `${TOUCH_TARGET_MIN_MOBILE_ONLY} p-2 text-gray-400 ${ACTION_HOVER_CLASS} rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center`;
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
                type="button"
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
