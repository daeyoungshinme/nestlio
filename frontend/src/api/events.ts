import { apiDelete, apiGet, apiPost, apiPut } from "@/api/client";
import type { EventCreateIn, EventImportResultOut, EventListOut, EventOut, EventUpdateIn } from "@/types";

export const fetchEvents = (dateFrom: string, dateTo: string) =>
  apiGet<EventListOut>("/events", { params: { date_from: dateFrom, date_to: dateTo } });

export const createEvent = (payload: EventCreateIn) => apiPost<EventOut>("/events", payload);

export const updateEvent = (id: number, payload: EventUpdateIn) =>
  apiPut<EventOut>(`/events/${id}`, payload);

export const deleteEvent = (id: number) => apiDelete(`/events/${id}`);

export const importGoogleEvents = (dateFrom: string, dateTo: string) =>
  apiPost<EventImportResultOut>("/events/import-google", null, {
    params: { date_from: dateFrom, date_to: dateTo },
  });
