import { useState } from "react";
import { ASSET_RELATED_KEYS } from "@/constants/queryKeys";
import { useCrudMutations } from "@/hooks/useCrudMutations";
import { useGrowlioSyncMutation } from "@/hooks/useGrowlioSyncMutation";

interface AssetSectionOptions<TItem, TCreate, TUpdate> {
  api: {
    create: (payload: TCreate) => Promise<unknown>;
    update: (id: number, payload: TUpdate) => Promise<unknown>;
    deactivate: (id: number) => Promise<unknown>;
    sync: (id: number) => Promise<unknown>;
  };
  /** 행(TItem)에서 서버 id를 꺼낸다 — 계좌는 `{ account, balance }` 래퍼라 리소스마다 다르다. */
  getId: (item: TItem) => number;
  messages: { create: string; deactivate?: string; sync: string };
}

/** 자산 섹션(계좌·저축/투자·부동산)이 똑같이 반복하던 상태·mutation 묶음.
 * 폼 대상(신규/수정 중인 행)·비활성화 확인 대상·growlio 가져오기 모달 열림 상태와, 자산 합계에 걸린
 * 캐시(ASSET_RELATED_KEYS)를 무효화하는 생성/수정/비활성화/동기화 mutation을 한 번에 돌려준다.
 * 화면 골격은 `components/accounts/AssetSectionShell`이 맡는다. */
export function useAssetSection<TItem, TCreate, TUpdate>({
  api,
  getId,
  messages,
}: AssetSectionOptions<TItem, TCreate, TUpdate>) {
  const [formTarget, setFormTarget] = useState<"new" | TItem | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { createMutation, updateMutation, removeMutation: deactivateMutation } = useCrudMutations<
    TCreate,
    TUpdate,
    unknown
  >({
    invalidateKeys: ASSET_RELATED_KEYS,
    api: { create: api.create, update: api.update, remove: api.deactivate },
    messages: { create: messages.create, update: "저장했습니다.", remove: messages.deactivate ?? "비활성화했습니다." },
    onCreateSuccess: () => setFormTarget(null),
    onUpdateSuccess: () => setFormTarget(null),
    onRemoveSuccess: () => setDeactivateTarget(null),
  });
  const syncMutation = useGrowlioSyncMutation(api.sync, messages.sync);

  /** 폼 제출 — 신규면 생성, 수정이면 그 행의 id로 업데이트. 계좌처럼 생성/수정 페이로드 모양이 다르면 둘을 따로 넘긴다. */
  const submit = (createPayload: TCreate, updatePayload: TUpdate) => {
    if (formTarget === "new") {
      createMutation.mutate(createPayload);
    } else if (formTarget !== null) {
      updateMutation.mutate({ id: getId(formTarget), payload: updatePayload });
    }
  };

  return {
    formTarget,
    isNew: formTarget === "new",
    editing: formTarget === "new" ? null : formTarget,
    openNew: () => setFormTarget("new"),
    openEdit: (item: TItem) => setFormTarget(item),
    closeForm: () => setFormTarget(null),
    deactivateTarget,
    askDeactivate: (item: TItem) => setDeactivateTarget(getId(item)),
    confirmDeactivate: () => {
      if (deactivateTarget !== null) deactivateMutation.mutate(deactivateTarget);
    },
    cancelDeactivate: () => setDeactivateTarget(null),
    importOpen,
    openImport: () => setImportOpen(true),
    closeImport: () => setImportOpen(false),
    isSaving: createMutation.isPending || updateMutation.isPending,
    syncPending: syncMutation.isPending,
    sync: (item: TItem) => syncMutation.mutate(getId(item)),
    submit,
  };
}
