import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import { SettingsSectionCard, ToggleRow } from "@/components/settings/shared";
import { updateMe, updateUser } from "@/api/users";
import { useMe, useSpouse } from "@/hooks/useReferenceData";
import { USER_RELATED_KEYS } from "@/constants/queryKeys";
import { useThemeStore } from "@/stores/themeStore";
import { toast } from "@/utils/toast";

export default function AccountSection() {
  const queryClient = useQueryClient();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const meQuery = useMe();
  const spouse = useSpouse();

  const [displayNameEdit, setDisplayNameEdit] = useState<string | null>(null);
  const [spouseDisplayNameEdit, setSpouseDisplayNameEdit] = useState<string | null>(null);

  // 표시 이름은 거래·일정·알림·대시보드·회고 응답에도 박혀 있다(USER_RELATED_KEYS).
  const invalidateUserRelated = () =>
    USER_RELATED_KEYS.forEach((key) => void queryClient.invalidateQueries({ queryKey: key }));

  const updateDisplayNameMutation = useMutation({
    mutationFn: updateMe,
    onSuccess: () => {
      invalidateUserRelated();
      setDisplayNameEdit(null);
      toast("표시 이름을 저장했습니다.", "success");
    },
  });

  const updateSpouseDisplayNameMutation = useMutation({
    mutationFn: (display_name: string) => updateUser(spouse!.id, display_name),
    onSuccess: () => {
      invalidateUserRelated();
      setSpouseDisplayNameEdit(null);
      toast("배우자 표시 이름을 저장했습니다.", "success");
    },
  });

  return (
    <SettingsSectionCard title="계정">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <FormInput
            label="내 표시 이름"
            value={displayNameEdit ?? meQuery.data?.display_name ?? ""}
            onChange={(e) => setDisplayNameEdit(e.target.value)}
            hint="목표·홈에서 두 분을 구분하는 이름이에요(예: 남편, 아내)."
            maxLength={100}
          />
        </div>
        <Button
          size="sm"
          disabled={
            displayNameEdit === null ||
            displayNameEdit.trim() === "" ||
            displayNameEdit === meQuery.data?.display_name
          }
          loading={updateDisplayNameMutation.isPending}
          onClick={() => displayNameEdit && updateDisplayNameMutation.mutate(displayNameEdit.trim())}
        >
          저장
        </Button>
      </div>
      {spouse && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <FormInput
              label="배우자 표시 이름"
              value={spouseDisplayNameEdit ?? spouse.display_name}
              onChange={(e) => setSpouseDisplayNameEdit(e.target.value)}
              hint="배우자에게도 그대로 보여요."
              maxLength={100}
            />
          </div>
          <Button
            size="sm"
            disabled={
              spouseDisplayNameEdit === null ||
              spouseDisplayNameEdit.trim() === "" ||
              spouseDisplayNameEdit === spouse.display_name
            }
            loading={updateSpouseDisplayNameMutation.isPending}
            onClick={() =>
              spouseDisplayNameEdit && updateSpouseDisplayNameMutation.mutate(spouseDisplayNameEdit.trim())
            }
          >
            저장
          </Button>
        </div>
      )}
      {/* 예전 버튼은 "다음 상태"를 라벨로 보여줘 지금 어떤 모드인지 헷갈렸다 — 현재 상태를 보여주는 스위치로. */}
      <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
        <ToggleRow label="다크 모드" checked={isDark} onChange={() => toggleTheme()} />
      </div>
    </SettingsSectionCard>
  );
}
