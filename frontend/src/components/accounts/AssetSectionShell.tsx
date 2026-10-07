import type { ReactNode } from "react";
import { Download, Plus } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import EmptyState from "@/components/common/EmptyState";

interface Props {
  addLabel: string;
  onAdd: () => void;
  onImport: () => void;
  isEmpty: boolean;
  emptyTitle: string;
  /** 비활성화 확인 문구 — deactivateOpen일 때만 ConfirmModal이 뜬다. */
  deactivateMessage: string;
  deactivateOpen: boolean;
  onConfirmDeactivate: () => void;
  onCancelDeactivate: () => void;
  /** 목록(합계 바·그룹·행) — 비어 있지 않을 때만 렌더된다. */
  children: ReactNode;
  /** 폼 모달·가져오기 모달 등 열림 상태를 섹션이 직접 판단하는 오버레이. */
  overlays?: ReactNode;
  className?: string;
}

/** 자산 섹션(계좌·저축/투자·부동산) 공통 골격 — 상단 "growlio에서 가져오기"/"추가" 버튼, 빈 상태,
 * 비활성화 확인 모달. 행·합계·폼은 섹션마다 달라 children/overlays로 받는다(상태는 useAssetSection). */
export default function AssetSectionShell({
  addLabel,
  onAdd,
  onImport,
  isEmpty,
  emptyTitle,
  deactivateMessage,
  deactivateOpen,
  onConfirmDeactivate,
  onCancelDeactivate,
  children,
  overlays,
  className = "space-y-4",
}: Props) {
  return (
    <div className={className}>
      <div className="flex justify-end gap-2 flex-wrap">
        <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={onImport}>
          growlio에서 가져오기
        </Button>
        <Button size="sm" icon={<Plus size={14} />} onClick={onAdd}>
          {addLabel}
        </Button>
      </div>

      {isEmpty ? <EmptyState title={emptyTitle} compact /> : children}

      {overlays}

      {deactivateOpen && (
        <ConfirmModal message={deactivateMessage} onConfirm={onConfirmDeactivate} onCancel={onCancelDeactivate} />
      )}
    </div>
  );
}
