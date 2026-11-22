export type PesCompletion = {
  draft: string;
  questions: { question: string; answer: string }[];
  note?: string;
};

export function isPesCompletion(value: unknown): value is PesCompletion {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { draft, questions, note } = value as Record<string, unknown>;
  return Object.keys(value).every((key) => ["draft", "questions", "note"].includes(key))
    && typeof draft === "string" && !!draft.trim() && draft.length <= 12000
    && (note === undefined || typeof note === "string" && note.length <= 12000)
    && Array.isArray(questions) && questions.length <= 40
    && questions.every((item) =>
      item && typeof item === "object" && !Array.isArray(item)
      && Object.keys(item).every((key) => key === "question" || key === "answer")
      && typeof item.question === "string" && !!item.question.trim() && item.question.length <= 2000
      && typeof item.answer === "string" && item.answer.length <= 12000)
    && (!!note?.trim() || questions.length > 0);
}
