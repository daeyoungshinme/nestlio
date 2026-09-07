import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, UserMinus, UserPlus, X } from "lucide-react";
import Button from "@/components/common/Button";
import ConfirmModal from "@/components/common/ConfirmModal";
import FormInput from "@/components/common/FormInput";
import { SettingsSectionCard, onMutationError } from "@/components/settings/shared";
import { cancelInvite, createInvite, fetchInvites } from "@/api/invites";
import { removeUser } from "@/api/users";
import { useMe, useUsers } from "@/hooks/useReferenceData";
import { QUERY_KEYS } from "@/constants/queryKeys";
import { inviteStatusLabel, inviteStatusTextClass } from "@/utils/colors";
import type { InviteStatus } from "@/utils/colors";
import { toast } from "@/utils/toast";
import type { InviteOut } from "@/types";

function inviteStatus(invite: InviteOut): InviteStatus {
  if (invite.accepted_at) return "accepted";
  if (new Date(invite.expires_at) < new Date()) return "expired";
  return "pending";
}

export default function HouseholdSection() {
  const queryClient = useQueryClient();
  const meQuery = useMe();
  const usersQuery = useUsers();
  const invitesQuery = useQuery({ queryKey: QUERY_KEYS.invites, queryFn: fetchInvites });
  const spouse = meQuery.data && usersQuery.data?.find((u) => u.id !== meQuery.data!.id);
  const householdFull = (usersQuery.data?.length ?? 0) >= 2;

  const [inviteEmail, setInviteEmail] = useState("");
  const [removeSpouseOpen, setRemoveSpouseOpen] = useState(false);
  const [removeSpouseConfirmText, setRemoveSpouseConfirmText] = useState("");

  const createInviteMutation = useMutation({
    mutationFn: createInvite,
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.invites });
      setInviteEmail("");
      if (res.email_sent) {
        toast("배우자에게 초대 메일을 보냈습니다.", "success");
      } else {
        toast("초대를 생성했지만 메일 발송에 실패했습니다. 아래 목록에서 링크를 복사해 직접 전달해주세요.", "info");
      }
    },
    onError: onMutationError,
  });

  const cancelInviteMutation = useMutation({
    mutationFn: cancelInvite,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.invites });
      toast("초대를 취소했습니다.", "success");
    },
    onError: onMutationError,
  });

  const removeSpouseMutation = useMutation({
    mutationFn: () => removeUser(spouse!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.me });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboardAll });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.monthlyRetrospective });
      setRemoveSpouseOpen(false);
      setRemoveSpouseConfirmText("");
      toast("배우자를 제거했습니다.", "success");
    },
    onError: onMutationError,
  });

  const copyAcceptUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast("초대 링크를 복사했습니다.", "success");
    } catch {
      toast("링크 복사에 실패했습니다.", "error");
    }
  };

  return (
    <SettingsSectionCard title="가구·초대">
      <div className="space-y-3">
        {householdFull ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">이미 배우자가 등록되어 있어요.</p>
            {spouse && (
              <Button
                variant="danger"
                size="sm"
                icon={<UserMinus size={14} />}
                onClick={() => setRemoveSpouseOpen(true)}
              >
                배우자 제거
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              이메일로 초대를 보내면, 배우자가 링크를 눌러 직접 계정을 만들 수 있어요.
            </p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <FormInput
                  label="배우자 이메일"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="spouse@example.com"
                />
              </div>
              <Button
                size="sm"
                icon={<UserPlus size={14} />}
                disabled={!inviteEmail}
                loading={createInviteMutation.isPending}
                onClick={() => createInviteMutation.mutate(inviteEmail)}
              >
                초대
              </Button>
            </div>
          </>
        )}

        {!!invitesQuery.data?.length && (
          <ul className="space-y-2">
            {invitesQuery.data.map((invite) => {
              const status = inviteStatus(invite);
              return (
                <li
                  key={invite.id}
                  className="flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div className="min-w-0">
                    <p className="text-gray-700 dark:text-gray-300 truncate">{invite.email}</p>
                    <p className={`text-xs ${inviteStatusTextClass(status)}`}>{inviteStatusLabel(status)}</p>
                  </div>
                  {status === "pending" && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="초대 링크 복사"
                        onClick={() => void copyAcceptUrl(invite.accept_url)}
                      >
                        <Copy size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="초대 취소"
                        disabled={cancelInviteMutation.isPending && cancelInviteMutation.variables === invite.id}
                        loading={cancelInviteMutation.isPending && cancelInviteMutation.variables === invite.id}
                        onClick={() => cancelInviteMutation.mutate(invite.id)}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {removeSpouseOpen && spouse && (
        <ConfirmModal
          message={`"${spouse.display_name}"님을 가구에서 제외할까요? 거래내역 등 기존 기록은 그대로 남지만, 이후 다른 계정으로 그 자리를 채울 수 있어요.`}
          confirmLabel="제거"
          confirmDisabled={removeSpouseConfirmText !== spouse.display_name || removeSpouseMutation.isPending}
          onConfirm={() => removeSpouseMutation.mutate()}
          onCancel={() => {
            setRemoveSpouseOpen(false);
            setRemoveSpouseConfirmText("");
          }}
        >
          <div className="mt-3">
            <FormInput
              label={`확인을 위해 "${spouse.display_name}"을 입력하세요`}
              value={removeSpouseConfirmText}
              onChange={(e) => setRemoveSpouseConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
        </ConfirmModal>
      )}
    </SettingsSectionCard>
  );
}
