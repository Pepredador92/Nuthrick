import { useId } from "react";
import { Plus, X } from "lucide-react";
import { Input, Textarea } from "@/src/components/ui/FormField";
import {
  emptyValue,
  inputValue,
  isRecord,
  repeatableFields,
  stringList,
  toggleChoice,
} from "@/src/features/consultations/questionnaire";
import type {
  Question,
  RepeatableField,
} from "@/src/features/consultations/questionnaire";

export function QuestionField({
  question,
  value,
  onChange,
  errors = [],
}: {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
  errors?: string[];
}) {
  const id = useId();
  const options = stringList(question.configuration.options);
  const helpId = `${id}-help`;
  const baseInput = {
    id,
    "aria-describedby": question.help_text ? helpId : undefined,
    "aria-invalid": errors.length > 0,
  };
  const title = (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <label
        id={`${id}-label`}
        htmlFor={id}
        className="text-sm font-semibold leading-6 text-[#29483f]"
      >
        {question.label}
        {question.is_required && (
          <span className="ml-1 text-[#9b493a]" aria-label="obligatorio">
            *
          </span>
        )}
      </label>
      {question.response_area === "professional_assessment" && (
        <span className="rounded-md bg-[#f5eddd] px-2 py-1 text-[10px] font-semibold text-[#785c32]">
          Criterio profesional
        </span>
      )}
    </div>
  );
  let control;

  if (question.configuration.widget === "frequency_grid") {
    const frequencies = isRecord(value) ? value : {};
    control = (
      <div className="divide-y divide-[#e6ece7] rounded-xl border border-[#dfe5e1] px-3">
        {stringList(question.configuration.items).map((group, index) => (
          <div
            key={group}
            className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:items-center"
          >
            <label
              htmlFor={`${id}-${index}`}
              className="text-sm text-[#496155]"
            >
              {group}
            </label>
            <select
              id={`${id}-${index}`}
              className="nuth-input !min-w-0 !text-sm"
              value={inputValue(frequencies[group])}
              onChange={(event) =>
                onChange({ ...frequencies, [group]: event.target.value })
              }
            >
              <option value="">Sin registrar</option>
              {options.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    );
  } else if (question.question_type === "boolean") {
    control = (
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="flex flex-wrap gap-2"
      >
        {[true, false].map((option) => (
          <button
            type="button"
            key={String(option)}
            aria-pressed={value === option}
            className={`rounded-xl border px-5 py-2.5 text-sm font-semibold ${value === option ? "border-[#598871] bg-[#e9f3ec] text-[#285647]" : "border-[#dfe5e1] text-[#60746a]"}`}
            onClick={() => onChange(value === option ? null : option)}
          >
            {option ? "Sí" : "No"}
          </button>
        ))}
      </div>
    );
  } else if (question.question_type === "multi_select") {
    const selected = stringList(value);
    const exclusive = stringList(question.configuration.exclusive_options);
    // Keep legacy selections visible rather than silently dropping saved answers.
    const allOptions = [...new Set([...options, ...selected])];
    control = (
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="grid min-w-0 gap-2 sm:grid-cols-2"
      >
        {allOptions.map((option) => (
          <label
            key={option}
            className={`flex min-w-0 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm leading-5 ${selected.includes(option) ? "border-[#91b49f] bg-[#edf5ef] text-[#285647]" : "border-[#e1e7e2] bg-white text-[#5f7067]"}`}
          >
            <input
              type="checkbox"
              className="mt-1 shrink-0 accent-[#315e4f]"
              checked={selected.includes(option)}
              onChange={() =>
                onChange(toggleChoice(selected, option, exclusive))
              }
            />
            <span className="min-w-0 [overflow-wrap:anywhere]">{option}</span>
          </label>
        ))}
      </div>
    );
  } else if (question.question_type === "select") {
    const saved = inputValue(value);
    control = (
      <select
        {...baseInput}
        className="nuth-input !min-w-0"
        value={saved}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Sin responder · selecciona una opción</option>
        {saved && !options.includes(saved) && (
          <option value={saved}>{saved} (guardado anteriormente)</option>
        )}
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  } else if (question.question_type === "repeatable_group") {
    const fields = repeatableFields(question.configuration);
    const rows = Array.isArray(value) ? value.filter(isRecord) : [];
    const maxRows =
      typeof question.configuration.max_rows === "number"
        ? question.configuration.max_rows
        : 100;
    const setField = (index: number, key: string, nextValue: string) =>
      onChange(
        rows.map((row, i) =>
          i === index ? { ...row, [key]: nextValue } : row,
        ),
      );
    const renderField = (
      field: RepeatableField,
      row: Record<string, unknown>,
      index: number,
    ) => {
      const fieldId = `${id}-${index}-${field.key}`;
      return (
        <div key={field.key} className="min-w-0">
          <label
            className="mb-1.5 block text-xs font-medium leading-5 text-[#5c7166]"
            htmlFor={fieldId}
          >
            {field.label}
            {field.required ? " *" : ""}
          </label>
          {field.type === "select" ? (
            <select
              id={fieldId}
              className="nuth-input !min-w-0"
              value={inputValue(row[field.key])}
              onChange={(event) =>
                setField(index, field.key, event.target.value)
              }
            >
              <option value="">Sin registrar</option>
              {inputValue(row[field.key]) &&
                !field.options?.includes(inputValue(row[field.key])) && (
                  <option>{inputValue(row[field.key])}</option>
                )}
              {field.options?.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          ) : (
            <Input
              id={fieldId}
              className="!min-w-0"
              type={field.type ?? "text"}
              step={field.type === "number" ? "any" : undefined}
              min={field.min}
              max={field.max}
              maxLength={500}
              value={inputValue(row[field.key])}
              placeholder={field.placeholder}
              onChange={(event) =>
                setField(index, field.key, event.target.value)
              }
            />
          )}
        </div>
      );
    };
    control = (
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div
            key={index}
            className="min-w-0 rounded-2xl border border-[#dfe5e1] bg-[#fbfcfa] p-3 sm:p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#718578]">
                Registro {index + 1}
              </span>
              <button
                type="button"
                aria-label={`Quitar registro ${index + 1} de ${question.label}`}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[#9b493a]"
                onClick={() => {
                  if (
                    emptyValue(row) ||
                    window.confirm(
                      "¿Quitar este registro? Se eliminará del borrador al guardar.",
                    )
                  )
                    onChange(rows.filter((_, i) => i !== index));
                }}
              >
                <X size={14} />
                Quitar
              </button>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {fields
                .filter((field) => !field.detail)
                .map((field) => renderField(field, row, index))}
            </div>
            {fields.some((field) => field.detail) && (
              <details className="mt-3 border-t border-[#e2e9e3] pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-[#3d705d]">
                  Completar detalles
                  {fields.some(
                    (field) => field.detail && !emptyValue(row[field.key]),
                  )
                    ? " · con información"
                    : " (opcional)"}
                </summary>
                <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                  {fields
                    .filter((field) => field.detail)
                    .map((field) => renderField(field, row, index))}
                </div>
              </details>
            )}
          </div>
        ))}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[#b5cabc] bg-[#f7faf7] px-4 py-3 text-sm font-semibold text-[#3d705d]"
          disabled={rows.length >= maxRows}
          onClick={() => onChange([...rows, {}])}
        >
          <Plus size={16} />
          {String(question.configuration.add_label ?? "Agregar registro")}
        </button>
        {!rows.length && (
          <p className="text-xs text-[#859289]">
            Sin registros. Agrega únicamente lo que corresponda.
          </p>
        )}
      </div>
    );
  } else {
    const maxLength =
      typeof question.configuration.max_length === "number"
        ? question.configuration.max_length
        : 2000;
    const type = ["number", "time", "date"].includes(question.question_type)
      ? question.question_type
      : "text";
    control =
      question.question_type === "long_text" ? (
        <Textarea
          {...baseInput}
          className="!min-h-24"
          maxLength={maxLength}
          value={inputValue(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          {...baseInput}
          className="!min-w-0"
          type={type}
          maxLength={maxLength}
          min={
            typeof question.configuration.min === "number"
              ? question.configuration.min
              : undefined
          }
          max={
            typeof question.configuration.max === "number"
              ? question.configuration.max
              : undefined
          }
          step={
            typeof question.configuration.step === "number"
              ? question.configuration.step
              : "any"
          }
          value={inputValue(value)}
          onChange={(event) =>
            onChange(
              type === "number" && event.target.value
                ? Number(event.target.value)
                : event.target.value,
            )
          }
        />
      );
  }
  return (
    <div
      id={`question-${question.question_key}`}
      data-question-key={question.question_key}
      className="min-w-0 space-y-3 scroll-mt-28"
    >
      {title}
      {question.help_text && (
        <p id={helpId} className="text-xs leading-5 text-[#74817d]">
          {question.help_text}
        </p>
      )}
      {control}
      {errors.map((error) => (
        <p key={error} role="alert" className="text-xs text-[#a04436]">
          {error}
        </p>
      ))}
    </div>
  );
}
