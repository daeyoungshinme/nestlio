import { useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import { INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import type { EventCreateIn, EventFrequency, EventOut } from "@/types";

const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "없음" },
  { value: "10", label: "10분 전" },
  { value: "30", label: "30분 전" },
  { value: "60", label: "1시간 전" },
  { value: "180", label: "3시간 전" },
  { value: "1440", label: "1일 전" },
];

export interface EventFormValues {
  title: string;
  description: string;
  location: string;
  all_day: boolean;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  frequency: EventFrequency;
  recurrence_end_date: string;
  reminder_minutes_before: string;
}

function splitOccurrence(iso: string): { date: string; time: string } {
  const [datePart, timePart] = iso.split("T");
  return { date: datePart, time: timePart ? timePart.slice(0, 5) : "" };
}

export function emptyEventFormValues(dateHint: string): EventFormValues {
  return {
    title: "",
    description: "",
    location: "",
    all_day: false,
    start_date: dateHint,
    start_time: "09:00",
    end_date: "",
    end_time: "",
    frequency: "once",
    recurrence_end_date: "",
    reminder_minutes_before: "",
  };
}

export function eventToFormValues(event: EventOut): EventFormValues {
  const start = splitOccurrence(event.start_at);
  const end = event.end_at ? splitOccurrence(event.end_at) : null;
  return {
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    all_day: event.all_day,
    start_date: start.date,
    start_time: start.time || "09:00",
    end_date: end?.date ?? "",
    end_time: end?.time ?? "",
    frequency: event.frequency,
    recurrence_end_date: event.recurrence_end_date ?? "",
    reminder_minutes_before: event.reminder_minutes_before != null ? String(event.reminder_minutes_before) : "",
  };
}

interface Props {
  initialValues: EventFormValues;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (payload: EventCreateIn) => void;
}

export default function EventForm({ initialValues, submitLabel, submitting, onSubmit }: Props) {
  const [form, setForm] = useState<EventFormValues>(initialValues);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const time = form.all_day ? "00:00" : form.start_time || "00:00";
    onSubmit({
      title: form.title,
      description: form.description || null,
      location: form.location || null,
      all_day: form.all_day,
      start_at: `${form.start_date}T${time}:00`,
      end_at: form.end_date ? `${form.end_date}T${form.all_day ? "00:00" : form.end_time || "00:00"}:00` : null,
      frequency: form.frequency,
      recurrence_end_date: form.frequency !== "once" && form.recurrence_end_date ? form.recurrence_end_date : null,
      reminder_minutes_before: form.reminder_minutes_before ? Number(form.reminder_minutes_before) : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormInput
        label="제목"
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        required
      />
      <div className="flex items-center gap-2">
        <input
          id="all-day"
          type="checkbox"
          checked={form.all_day}
          onChange={(e) => setForm((f) => ({ ...f, all_day: e.target.checked }))}
          className="h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor="all-day" className={LABEL_SM}>
          종일
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        <FormInput
          label="시작일"
          type="date"
          value={form.start_date}
          onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
          required
          className="w-40"
        />
        {!form.all_day && (
          <FormInput
            label="시작 시간"
            type="time"
            value={form.start_time}
            onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
            className="w-32"
          />
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <FormInput
          label="종료일 (선택)"
          type="date"
          value={form.end_date}
          onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
          className="w-40"
        />
        {!form.all_day && (
          <FormInput
            label="종료 시간"
            type="time"
            value={form.end_time}
            onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
            className="w-32"
          />
        )}
      </div>
      <FormInput
        label="장소 (선택)"
        value={form.location}
        onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
      />
      <div>
        <label className={`block mb-1 font-medium ${LABEL_SM}`}>설명 (선택)</label>
        <textarea
          className={`w-full ${INPUT_SM}`}
          rows={2}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>반복</label>
          <select
            className={`${INPUT_SM} w-28`}
            value={form.frequency}
            onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as EventFrequency }))}
          >
            <option value="once">한 번</option>
            <option value="weekly">매주</option>
            <option value="monthly">매월</option>
          </select>
        </div>
        {form.frequency !== "once" && (
          <FormInput
            label="반복 종료일 (선택)"
            type="date"
            value={form.recurrence_end_date}
            onChange={(e) => setForm((f) => ({ ...f, recurrence_end_date: e.target.value }))}
            className="w-40"
          />
        )}
        <div>
          <label className={`block mb-1 font-medium ${LABEL_SM}`}>리마인더</label>
          <select
            className={`${INPUT_SM} w-28`}
            value={form.reminder_minutes_before}
            onChange={(e) => setForm((f) => ({ ...f, reminder_minutes_before: e.target.value }))}
          >
            {REMINDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
