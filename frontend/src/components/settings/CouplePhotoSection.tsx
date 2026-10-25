import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import { SettingsSectionCard, onMutationError } from "@/components/settings/shared";
import { deleteCouplePhoto, uploadCouplePhoto } from "@/api/settings";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import { toast } from "@/utils/toast";

export default function CouplePhotoSection({ photoUrl }: { photoUrl: string | null }) {
  const fieldId = useId();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardBootstrap });
  };

  const uploadPhotoMutation = useMutation({
    mutationFn: uploadCouplePhoto,
    onSuccess: () => {
      invalidate();
      toast("부부 사진이 저장되었습니다.", "success");
    },
    onError: onMutationError,
  });

  const deletePhotoMutation = useMutation({
    mutationFn: deleteCouplePhoto,
    onSuccess: () => {
      invalidate();
      setConfirmDelete(false);
      toast("부부 사진을 삭제했습니다.", "success");
    },
    onError: onMutationError,
  });

  return (
    <SettingsSectionCard title="부부 사진">
      <p className="text-xs text-gray-500 dark:text-gray-400">대시보드 상단에 배너로 표시됩니다.</p>
      {photoUrl && <img src={photoUrl} alt="부부 사진" className="w-full h-32 object-cover rounded-lg" />}
      {/* 파일을 고르면 바로 올린다 — "파일 선택" 후 "업로드"를 한 번 더 누르는 2단계를 없앴다. */}
      <div className="flex items-center gap-2">
        <label
          htmlFor={`${fieldId}-input`}
          aria-disabled={uploadPhotoMutation.isPending}
          className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors aria-disabled:opacity-50 aria-disabled:pointer-events-none`}
        >
          {uploadPhotoMutation.isPending ? "올리는 중…" : photoUrl ? "사진 바꾸기" : "사진 올리기"}
        </label>
        <input
          id={`${fieldId}-input`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadPhotoMutation.mutate(file);
            e.target.value = "";
          }}
          className="sr-only"
        />
        {photoUrl && (
          <Button variant="danger" size="sm" loading={deletePhotoMutation.isPending} onClick={() => setConfirmDelete(true)}>
            삭제
          </Button>
        )}
      </div>
      {confirmDelete && (
        <ConfirmModal
          message="부부 사진을 삭제할까요?"
          confirmLabel="삭제"
          onConfirm={() => deletePhotoMutation.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </SettingsSectionCard>
  );
}
