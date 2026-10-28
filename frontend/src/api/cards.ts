import { apiGet, apiPost, apiPut } from "@/api/client";
import type { CardCreateIn, CardOut, CardUpdateIn, CardWithUsageOut } from "@/types";

export const fetchCards = () => apiGet<CardWithUsageOut[]>("/cards");

export const createCard = (payload: CardCreateIn) => apiPost<CardOut>("/cards", payload);

export const updateCard = (id: number, payload: CardUpdateIn) => apiPut<CardOut>(`/cards/${id}`, payload);

export const deactivateCard = (id: number) => apiPost(`/cards/${id}/deactivate`);
