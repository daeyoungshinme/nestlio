import { useId, useState } from "react";
import type { FormEvent } from "react";
import Button from "@/components/common/Button";
import FormInput from "@/components/common/FormInput";
import Modal from "@/components/common/Modal";
import { CATEGORY_TYPE_LABEL, CATEGORY_TYPE_ORDER } from "@/components/categories/categoryTypes";
import { COLOR_INPUT_SM, INPUT_SM, LABEL_SM } from "@/constants/inputStyles";
import { BENCHMARK_GROUP_LABELS, BENCHMARK_GROUP_ORDER } from "@/constants/benchmarkGroups";
import { DEFAULT_CATEGORY_COLOR } from "@/utils/colors";
import type { BenchmarkGroup, CategoryCreateIn, CategoryOut, CategoryType } from "@/types";

interface FormState {
  name: string;
  kind: "income" | "expense";
  type: CategoryType;
  color: string;
  benchmark_group: BenchmarkGroup | "";
}

const EMPTY_FORM: FormState = {
  name: "",
  kind: "expense",
  type: "variable",
  color: DEFAULT_CATEGORY_COLOR,
  benchmark_group: "",
};

function formFromCategory(category: CategoryOut): FormState {
  return {
    name: category.name,
    kind: category.kind,
    type: category.type,
    color: category.color,
    benchmark_group: category.benchmark_group ?? "",
  };
}

/** 카테고리 추가·수정 모달 — `category`가 있으면 수정, 없으면 추가. */
export default function CategoryFormModal({
  category,
  submitting,
  onClose,
  onSubmit,
}: {
  category: CategoryOut | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: CategoryCreateIn) => void;
}) {
  const fieldId = useId();
  const [form, setForm] = useState<FormState>(() => (category ? formFromCategory(category) : EMPTY_FORM));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ ...form, benchmark_group: form.benchmark_group || null });
  };

  return (
    <Modal onClose={onClose} title={category ? "카테고리 수정" : "카테고리 추가"}>
      <div className="p-6 overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormInput
            label="이름"
            value={form.name}
            maxLength={100}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <div>
            <label htmlFor={`${fieldId}-kind`} className={`block mb-1 font-medium ${LABEL_SM}`}>종류</label>
            <select
              id={`${fieldId}-kind`}
              className={`${INPUT_SM} w-full`}
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as "income" | "expense" }))}
            >
              <option value="expense">지출</option>
              <option value="income">수입</option>
            </select>
          </div>
          {/* 고정/변동/비정기 구분은 지출에만 뜻이 있다. */}
          {form.kind === "expense" && (
            <div>
              <label htmlFor={`${fieldId}-type`} className={`block mb-1 font-medium ${LABEL_SM}`}>구분</label>
              <select
                id={`${fieldId}-type`}
                className={`${INPUT_SM} w-full`}
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CategoryType }))}
              >
                {CATEGORY_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>
                    {CATEGORY_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor={`${fieldId}-benchmark`} className={`block mb-1 font-medium ${LABEL_SM}`}>
              표준 카테고리(선택)
            </label>
            <select
              id={`${fieldId}-benchmark`}
              className={`${INPUT_SM} w-full`}
              value={form.benchmark_group}
              onChange={(e) => setForm((f) => ({ ...f, benchmark_group: e.target.value as BenchmarkGroup | "" }))}
            >
              <option value="">지정 안 함</option>
              {BENCHMARK_GROUP_ORDER.map((group) => (
                <option key={group} value={group}>
                  {BENCHMARK_GROUP_LABELS[group]}
                </option>
              ))}
            </select>
          </div>
          <div className="shrink-0">
            <label htmlFor={`${fieldId}-color`} className={`block mb-1 font-medium ${LABEL_SM}`}>색상</label>
            <input
              id={`${fieldId}-color`}
              type="color"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              className={COLOR_INPUT_SM}
            />
          </div>
          <Button type="submit" loading={submitting} className="mt-2">
            {category ? "저장" : "추가"}
          </Button>
        </form>
      </div>
    </Modal>
  );
}
