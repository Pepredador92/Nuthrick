import type { AssessmentInput, Reference } from "./model";
export const WHO_BMI: Reference = {
  id: "who-adult-bmi",
  version: "2000-v1",
  title:
    "OMS · Obesity: preventing and managing the global epidemic. TRS 894 (2000)",
  url: "https://iris.who.int/handle/10665/42330",
};
export const WHO_WHR: Reference = {
  id: "who-whr",
  version: "2011",
  title: "OMS · Waist circumference and waist-hip ratio (2011)",
  url: "https://www.who.int/publications/i/item/9789241501491",
};
export const JP_M: Reference = {
  id: "jackson-pollock-men",
  version: "1978",
  title: "Jackson y Pollock · Body density of men (1978)",
  url: "https://pubmed.ncbi.nlm.nih.gov/718832/",
};
export const JP_F: Reference = {
  id: "jackson-pollock-ward-women",
  version: "1980",
  title: "Jackson, Pollock y Ward · Body density of women (1980)",
  url: "https://pubmed.ncbi.nlm.nih.gov/7402053/",
};
export const SIRI: Reference = {
  id: "siri",
  version: "1961",
  title:
    "Siri · Body composition from fluid spaces and density (1961); revisión National Research Council",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK218181/",
};
export const BROZEK: Reference = {
  id: "brozek",
  version: "1963",
  title: "Brozek et al. · Densitometric analysis of body composition (1963)",
  url: "https://pubmed.ncbi.nlm.nih.gov/14062375/",
};
export const LEAN_1996: Reference = {
  id: "lean-waist-triceps",
  version: "1996",
  title: "Lean et al. · Prediction of body composition by anthropometry (1996)",
  url: "https://pubmed.ncbi.nlm.nih.gov/8604668/",
};
export const HEATH_CARTER: Reference = {
  id: "heath-carter-somatotype",
  version: "1967-manual",
  title: "Heath y Carter · A modified somatotype method (1967)",
  url: "https://pubmed.ncbi.nlm.nih.gov/6049820/",
};

// Classification lives outside UI. Applicability must be confirmed for this measurement.
export function classifyBmi(
  value: number,
  input: AssessmentInput,
): { classification: string | null; reference: Reference | null } {
  if (
    !input.bmiReference ||
    input.age == null ||
    input.age < 18 ||
    input.context !== "adult"
  )
    return { classification: null, reference: null };
  const classification =
    value < 18.5
      ? "Bajo peso"
      : value < 25
        ? "Intervalo de peso normal"
        : value < 30
          ? "Sobrepeso"
          : value < 35
            ? "Obesidad, clase I"
            : value < 40
              ? "Obesidad, clase II"
              : "Obesidad, clase III";
  return { classification, reference: WHO_BMI };
}
