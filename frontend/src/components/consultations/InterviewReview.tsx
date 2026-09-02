import {
  emptyValue,
  formatAnswer,
  matchesCondition,
} from "@/src/features/consultations/questionnaire";
import type { Answers } from "@/src/features/consultations/questionnaire";
import type { ConsultationSnapshotStructure } from "@/src/types/domain";

export function InterviewReview({
  structure,
  values,
  onSection,
  showEmpty = false,
}: {
  structure: ConsultationSnapshotStructure;
  values: Answers;
  onSection?: (index: number) => void;
  showEmpty?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-3">
      {structure.sections.map((section, index) => {
        const questions = section.questions.filter(
          (question) =>
            matchesCondition(question.visibility_condition, values) &&
            (showEmpty || !emptyValue(values[question.question_key])),
        );
        if (!questions.length && !showEmpty) return null;
        return (
          <details
            key={section.section_key}
            open={index === 0}
            className="min-w-0 rounded-2xl border border-[#e0e7e1] bg-[#fbfcfa] p-4"
          >
            <summary className="cursor-pointer text-sm font-semibold text-[#315e4f]">
              {section.title}{" "}
              <span className="ml-1 text-xs font-normal text-[#819087]">
                ·{" "}
                {
                  questions.filter(
                    (question) => !emptyValue(values[question.question_key]),
                  ).length
                }{" "}
                respuestas
              </span>
            </summary>
            {onSection && (
              <button
                type="button"
                onClick={() => onSection(index)}
                className="mt-3 text-xs font-semibold text-[#3d705d]"
              >
                Revisar esta sección →
              </button>
            )}
            <dl className="mt-4 space-y-4">
              {questions.map((question) => (
                <div
                  key={question.question_key}
                  className="min-w-0 border-t border-[#e7ece8] pt-3 first:border-0 first:pt-0"
                >
                  <dt className="text-xs leading-5 text-[#74817d]">
                    {question.label}
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide">
                      {question.response_area === "professional_assessment"
                        ? "Profesional"
                        : "Referido"}
                    </span>
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#344f43] [overflow-wrap:anywhere]">
                    {formatAnswer(question, values[question.question_key])}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        );
      })}
    </div>
  );
}
