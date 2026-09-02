import { describe, expect, it } from "vitest";
import { initialInterview } from "./interviewTemplate";
import {
  createInterviewSummary,
  createSaveQueue,
  emptyValue,
  formatAnswer,
  matchesCondition,
  questionErrors,
  repeatableFields,
  sectionProgress,
  toggleChoice,
  templateQuestionErrors,
} from "./questionnaire";

const questions = initialInterview.sections.flatMap(
  (section) => section.questions,
);
const get = (key: string) => questions.find((q) => q.question_key === key)!;

describe("interview scope and structure", () => {
  it("keeps every seeded option and condition valid for editing", () => {
    expect(templateQuestionErrors(questions)).toEqual([]);
    const broken = questions.map((q) =>
      q.question_key === "main_reason"
        ? { ...q, configuration: { options: ["Mejorar hábitos", "Diabetes"] } }
        : q,
    );
    expect(
      templateQuestionErrors(broken).some((error) =>
        error.includes("Otro motivo de consulta"),
      ),
    ).toBe(true);
  });
  it("covers the fourteen pre-assessment blocks without anthropometric data", () => {
    expect(initialInterview.sections).toHaveLength(14);
    expect(questions).toHaveLength(103);
    expect(
      questions
        .map((q) => q.question_key)
        .filter((key) =>
          /weight|height|waist|bmi|anthrop|measurement/.test(key),
        ),
    ).toEqual([]);
    expect(new Set(questions.map((q) => q.question_key)).size).toBe(
      questions.length,
    );
    expect(
      questions.filter((q) => q.question_type === "long_text"),
    ).toHaveLength(1);
  });
  it("has bounded scripts, labels and valid database keys", () => {
    for (const section of initialInterview.sections) {
      expect(section.description!.length).toBeLessThanOrEqual(600);
      for (const q of section.questions)
        expect(q.question_key).toMatch(/^[a-z0-9][a-z0-9_-]{1,119}$/);
    }
  });
  it("separates reported information from professional interpretation", () => {
    expect(get("medical_diagnoses_v2").response_area).toBe("patient_reported");
    expect(get("symptom_action").response_area).toBe("professional_assessment");
    expect(get("interview_notes").is_required).toBe(false);
  });
  it("captures medication and dietary recall details with durable keys", () => {
    expect(
      repeatableFields(get("medication_list_v2").configuration).map(
        (f) => f.key,
      ),
    ).toEqual(
      expect.arrayContaining([
        "name",
        "dose",
        "frequency",
        "schedule",
        "reason",
        "since",
        "prescriber",
      ]),
    );
    expect(
      repeatableFields(get("recall_24h_v2").configuration).map((f) => f.key),
    ).toEqual(
      expect.arrayContaining([
        "food",
        "time",
        "occasion",
        "amount",
        "brand",
        "preparation",
        "ingredients",
        "accompaniments",
        "place",
      ]),
    );
  });
});

describe("conditional and quick answers", () => {
  it("does not mistake false or zero for an unanswered question", () => {
    expect(emptyValue(false)).toBe(false);
    expect(emptyValue(0)).toBe(false);
    expect(emptyValue("  ")).toBe(true);
    expect(emptyValue([{}])).toBe(true);
    expect(emptyValue({ Veg: "" })).toBe(true);
  });
  it("opens treatment details only for a yes answer", () => {
    const condition = get("medication_list_v2").visibility_condition;
    expect(matchesCondition(condition, {})).toBe(false);
    expect(matchesCondition(condition, { medication_status: "No" })).toBe(
      false,
    );
    expect(matchesCondition(condition, { medication_status: "Sí" })).toBe(true);
  });
  it("supports other details for single and multiple choice", () => {
    expect(
      matchesCondition(get("main_reason_other").visibility_condition, {
        main_reason: "Otra",
      }),
    ).toBe(true);
    expect(
      matchesCondition(get("expectations_other").visibility_condition, {
        expectations: ["Otra"],
      }),
    ).toBe(true);
    expect(
      matchesCondition(get("expectations_other").visibility_condition, {
        expectations: [],
      }),
    ).toBe(false);
  });
  it("only opens symptom details for relevant selections across groups", () => {
    const condition = get("symptom_details_v2").visibility_condition;
    expect(
      matchesCondition(condition, {
        digestive_screen: ["Ninguno referido"],
        general_symptoms: [],
        appetite: "Sin cambios",
      }),
    ).toBe(false);
    expect(matchesCondition(condition, { general_symptoms: ["Fatiga"] })).toBe(
      true,
    );
    expect(matchesCondition(condition, { appetite: "Menor apetito" })).toBe(
      true,
    );
  });
  it("keeps none, unknown and refusal mutually exclusive", () => {
    const excluded = [
      "Ninguno referido",
      "No sabe / no recuerda",
      "Prefiere no responder",
    ];
    expect(toggleChoice(["Fatiga"], "Ninguno referido", excluded)).toEqual([
      "Ninguno referido",
    ]);
    expect(toggleChoice(["Ninguno referido"], "Fatiga", excluded)).toEqual([
      "Fatiga",
    ]);
    expect(toggleChoice(["Fatiga"], "Fatiga", excluded)).toEqual([]);
  });
  it("does not force optional notes or hidden details to complete a section", () => {
    expect(questionErrors(get("interview_notes"), "")).toEqual([]);
    expect(questionErrors(get("main_reason"), "")).toHaveLength(1);
    const section = initialInterview.sections.find(
      (s) => s.section_key === "treatments",
    )!;
    expect(sectionProgress(section, { medication_status: "No" }).answered).toBe(
      1,
    );
    expect(
      sectionProgress(section, { medication_status: "Sí" }).total,
    ).toBeGreaterThan(
      sectionProgress(section, { medication_status: "No" }).total,
    );
  });
  it("validates partially completed records and numeric bounds", () => {
    expect(
      questionErrors(get("medication_list_v2"), [{ dose: "500 mg" }]),
    ).toEqual(["Registro 1: falta nombre del producto."]);
    expect(questionErrors(get("known_steps"), -3)).toHaveLength(1);
    expect(questionErrors(get("known_steps"), 0)).toEqual([]);
  });
  it("formats grouped, frequency and boolean values without raw JSON", () => {
    expect(
      formatAnswer(get("medication_list_v2"), [
        { name: "Prueba", dose: "5 mg" },
      ]),
    ).toBe("1. Nombre del producto: Prueba · Dosis y unidad: 5 mg");
    expect(
      formatAnswer(get("food_frequency_v2"), {
        Verduras: "Diario",
        Frutas: "",
      }),
    ).toBe("Verduras: Diario");
    expect(formatAnswer(get("main_reason"), false)).toBe("No");
  });
  it("does not turn hidden stale responses into summary evidence", () => {
    const summary = createInterviewSummary(initialInterview, {
      medication_status: "No",
      medication_list_v2: [{ name: "Old medication" }],
      interview_notes: "Pendiente de verificar",
    });
    expect(summary).not.toContain("Old medication");
    expect(summary).toContain("Profesional");
    expect(summary).toContain("Referido");
  });
});

describe("serialized autosave", () => {
  it("finishes old writes before new writes and recovers after failure", async () => {
    const enqueue = createSaveQueue();
    const events: string[] = [];
    let release!: () => void;
    const first = enqueue(async () => {
      events.push("old-start");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      events.push("old-done");
    });
    const second = enqueue(async () => {
      events.push("new-done");
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["old-start"]);
    release();
    await Promise.all([first, second]);
    expect(events).toEqual(["old-start", "old-done", "new-done"]);
    await expect(
      enqueue(async () => {
        throw new Error("Offline");
      }),
    ).rejects.toThrow("Offline");
    await enqueue(async () => {
      events.push("retry-ok");
    });
    expect(events.at(-1)).toBe("retry-ok");
  });
});
