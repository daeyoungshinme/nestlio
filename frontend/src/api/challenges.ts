import { apiDelete, apiGet, apiPost, apiPut } from "@/api/client";
import type { ChallengeCreateIn, ChallengeOut, ChallengeProgressIn, ChallengeUpdateIn } from "@/types";

export const fetchChallenges = () => apiGet<ChallengeOut[]>("/challenges");

export const createChallenge = (payload: ChallengeCreateIn) => apiPost<ChallengeOut>("/challenges", payload);

export const updateChallenge = (id: number, payload: ChallengeUpdateIn) =>
  apiPut<ChallengeOut>(`/challenges/${id}`, payload);

export const updateChallengeProgress = (id: number, payload: ChallengeProgressIn) =>
  apiPut<ChallengeOut>(`/challenges/${id}/progress`, payload);

export const deleteChallenge = (id: number) => apiDelete(`/challenges/${id}`);
