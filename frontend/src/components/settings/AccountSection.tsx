import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Moon, Sun } from "lucide-react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import { SettingsSectionCard, onMutationError } from "@/components/settings/shared";
import { updateMe, updateUser } from "@/api/users";
import { useMe, useUsers } from "@/hooks/useReferenceData";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { useThemeStore } from "@/stores/themeStore";
import { toast } from "@/utils/toast";

export default function AccountSection() {
  const queryClient = useQueryClient();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const meQuery = useMe();
  const usersQuery = useUsers();
  const spouse = meQuery.data && usersQuery.data?.find((u) => u.id !== meQuery.data!.id);

  const [displayNameEdit, setDisplayNameEdit] = useState<string | null>(null);
  const [spouseDisplayNameEdit, setSpouseDisplayNameEdit] = useState<string | null>(null);

  const updateDisplayNameMutation = useMutation({
    mutationFn: updateMe,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.me });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardBootstrap });
      setDisplayNameEdit(null);
      toast("표시 이름을 저장했습니다.", "success");
    },
    onError: onMutationError,
  });

  const updateSpouseDisplayNameMutation = useMutation({
    mutationFn: (display_name: string) => updateUser(spouse!.id, display_name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardBootstrap });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.monthlyRetrospective });
      setSpouseDisplayNameEdit(null);
      toast("배우자 표시 이름을 저장했습니다.", "success");
    },
    onError: onMutationError,
  });

  return (
    <SettingsSectionCard title="계정">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <FormInput
            label="내 표시 이름"
            value={displayNameEdit ?? meQuery.data?.display_name ?? ""}
            onChange={(e) => setDisplayNameEdit(e.target.value)}
            hint="남편, 아내처럼 원하는 별칭을 입력할 수 있어요. 목표 항목 구분, 대시보드 배우자별 합계 등에 표시돼요."
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
              hint="배우자를 대신해 별칭을 정할 수 있어요. 배우자에게도 그대로 보여요."
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
      <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
        <button
          onClick={toggleTheme}
          aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
          className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <span className="flex items-center gap-3">
            {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            {isDark ? "라이트 모드" : "다크 모드"}
          </span>
        </button>
      </div>
    </SettingsSectionCard>
  );
}
