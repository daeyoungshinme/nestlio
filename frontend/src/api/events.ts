import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/api/client";
import type { EventCreateIn, EventListOut, EventOut, EventUpdateIn } from "@/types";

export const fetchEvents = (dateFrom: string, dateTo: string) =>
  apiGet<EventListOut>("/events", { params: { date_from: dateFrom, date_to: dateTo } });

export const createEvent = (payload: EventCreateIn) => apiPost<EventOut>("/events", payload);

export const updateEvent = (id: number, payload: EventUpdateIn) =>
  apiPut<EventOut>(`/events/${id}`, payload);

export const deleteEvent = (id: number) => apiDelete(`/events/${id}`);

/** occurrenceDate: 반복 일정에서 완료할 회차의 날짜(단건은 백엔드가 무시한다). */
export const completeEvent = (id: number, completed: boolean, occurrenceDate: string) =>
  apiPatch<EventOut>(`/events/${id}/complete`, { completed, occurrence_date: occurrenceDate });
