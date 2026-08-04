import { apiDelete, apiGet, apiPost } from "@/api/client";
import type { InviteAcceptIn, InviteOut, UserOut } from "@/types";

export const fetchInvites = () => apiGet<InviteOut[]>("/invites");

export const createInvite = (email: string) => apiPost<InviteOut>("/invites", { email });

export const cancelInvite = (id: string) => apiDelete<void>(`/invites/${id}`);

export const fetchInviteByToken = (token: string) => apiGet<InviteOut>(`/invites/token/${token}`);

export const acceptInvite = (token: string, payload: InviteAcceptIn) =>
  apiPost<UserOut>(`/invites/token/${token}/accept`, payload);
