import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { extractErrorMessage } from "@/utils/error";
import { toast } from "@/utils/toast";

interface CrudApi<TCreate, TUpdate, TItem> {
  create?: (payload: TCreate) => Promise<TItem>;
  update?: (id: number, payload: TUpdate) => Promise<TItem>;
  remove?: (id: number) => Promise<unknown>;
}

interface CrudMessages {
  create?: string;
  update?: string;
  remove?: string;
}

interface UseCrudMutationsOptions<TCreate, TUpdate, TItem> {
  /** Invalidated after every successful create/update/remove. */
  invalidateKeys: QueryKey[];
  api: CrudApi<TCreate, TUpdate, TItem>;
  messages?: CrudMessages;
  onCreateSuccess?: (item: TItem) => void;
  onUpdateSuccess?: (item: TItem) => void;
  onRemoveSuccess?: () => void;
}

/** CRUD 리소스 섹션(카테고리/계좌/대출/저축상품/재무목표/챌린지/고정지출)이 반복하던
 * create/update/remove mutation 3종 + invalidate/toast(성공)/toast(에러) 보일러플레이트를 캡슐화한다.
 * 폼 닫기 등 컴포넌트별 후처리는 onCreateSuccess/onUpdateSuccess/onRemoveSuccess로 주입한다. */
export function useCrudMutations<TCreate = never, TUpdate = never, TItem = unknown>({
  invalidateKeys,
  api,
  messages,
  onCreateSuccess,
  onUpdateSuccess,
  onRemoveSuccess,
}: UseCrudMutationsOptions<TCreate, TUpdate, TItem>) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    invalidateKeys.forEach((key) => void queryClient.invalidateQueries({ queryKey: key }));
  };

  const onError = (err: unknown) => toast(extractErrorMessage(err), "error");

  const createMutation = useMutation({
    mutationFn: (payload: TCreate) => {
      if (!api.create) throw new Error("create api not configured");
      return api.create(payload);
    },
    onSuccess: (item) => {
      invalidate();
      if (messages?.create) toast(messages.create, "success");
      onCreateSuccess?.(item);
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: TUpdate }) => {
      if (!api.update) throw new Error("update api not configured");
      return api.update(id, payload);
    },
    onSuccess: (item) => {
      invalidate();
      if (messages?.update) toast(messages.update, "success");
      onUpdateSuccess?.(item);
    },
    onError,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => {
      if (!api.remove) throw new Error("remove api not configured");
      return api.remove(id);
    },
    onSuccess: () => {
      invalidate();
      if (messages?.remove) toast(messages.remove, "success");
      onRemoveSuccess?.();
    },
    onError,
  });

  return { createMutation, updateMutation, removeMutation, invalidate };
}
