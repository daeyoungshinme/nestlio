import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import { SettingsSectionCard, onMutationError } from "@/components/settings/shared";
import { deleteCouplePhoto, uploadCouplePhoto } from "@/api/settings";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { TOUCH_TARGET_MIN_MOBILE_ONLY } from "@/constants/uiSizes";
import { toast } from "@/utils/toast";

export default function CouplePhotoSection({ photoUrl }: { photoUrl: string | null }) {
  const queryClient = useQueryClient();
  const [couplePhotoFile, setCouplePhotoFile] = useState<File | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
  };

  const uploadPhotoMutation = useMutation({
    mutationFn: uploadCouplePhoto,
    onSuccess: () => {
      invalidate();
      setCouplePhotoFile(null);
      toast("부부 사진이 저장되었습니다.", "success");
    },
    onError: onMutationError,
  });

  const deletePhotoMutation = useMutation({
    mutationFn: deleteCouplePhoto,
    onSuccess: () => {
      invalidate();
      toast("부부 사진을 삭제했습니다.", "success");
    },
    onError: onMutationError,
  });

  return (
    <SettingsSectionCard title="부부 사진">
      <p className="text-xs text-gray-500 dark:text-gray-400">대시보드 상단에 배너로 표시됩니다.</p>
      {photoUrl && <img src={photoUrl} alt="부부 사진" className="w-full h-32 object-cover rounded-lg" />}
      <div className="flex items-center gap-3">
        <label
          htmlFor="couple-photo-input"
          className={`${TOUCH_TARGET_MIN_MOBILE_ONLY} px-4 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors`}
        >
          파일 선택
        </label>
        <input
          id="couple-photo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setCouplePhotoFile(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        <span className="text-sm text-gray-500 dark:text-gray-400 truncate">
          {couplePhotoFile ? couplePhotoFile.name : "선택된 파일 없음"}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!couplePhotoFile}
          loading={uploadPhotoMutation.isPending}
          onClick={() => couplePhotoFile && uploadPhotoMutation.mutate(couplePhotoFile)}
        >
          업로드
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!photoUrl}
          loading={deletePhotoMutation.isPending}
          onClick={() => deletePhotoMutation.mutate()}
        >
          삭제
        </Button>
      </div>
    </SettingsSectionCard>
  );
}
