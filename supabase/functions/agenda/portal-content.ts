export type SharedClassificationRule = {
  id: string; label: string; lower: number | null; upper: number | null;
};
export type SharedClassification = {
  label: string; origin: string; source: string; consultationId: string;
  marker: number; low: number; high: number; rules: SharedClassificationRule[];
};
export type SharedWeightReference = {
  recorded?: { value: number; method: string | null };
  interval?: { lower: number; upper: number; heightCm: number };
  target?: { value: number; bmi: number };
};
export type SharedResultPresentation = {
  classification?: SharedClassification;
  currentReason?: string;
  weightReference?: SharedWeightReference;
};
export type SharedResult = {
  id: string; label: string; unit: string; method: string;
  conceptCode?: string; visualization?: 'line' | 'somatochart';
  presentation?: SharedResultPresentation;
  points: { consultationId: string; date: string; value: string; classificationLabel?: string }[];
};
export type PortalContent = {
  goal: string; instructions: string; results: SharedResult[];
  goalSource?: {consultationId:string;revision:number;questionKey:string}|null;
  consultations: { id: string; date: string; title: string; summary: string }[];
};
export const uuid = (v: unknown): string => {
  if (typeof v !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v)) throw new Error('invalid_input');
  return v;
};
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('invalid_input');
  return v as Record<string, unknown>;
};
const str = (v: unknown, max: number, required = false) => {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) throw new Error('invalid_input');
  return v.trim();
};
const arr = (v: unknown, max: number) => {
  if (!Array.isArray(v) || v.length > max) throw new Error('invalid_input');
  return v;
};
const date = (v: unknown) => {
  const s = str(v, 40, true);
  if (!/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(s) || !Number.isFinite(Date.parse(s))) throw new Error('invalid_input');
  return s;
};
const finite = (v: unknown, min = -1e9, max = 1e9) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error('invalid_input');
  return v;
};
const nullableFinite = (v: unknown) => v === null ? null : finite(v);
function classificationRule(value: unknown): SharedClassificationRule {
  const rule = obj(value);
  return {
    id: str(rule.id, 120, true), label: str(rule.label, 160, true),
    lower: nullableFinite(rule.lower), upper: nullableFinite(rule.upper),
  };
}
function resultPresentation(value: unknown): SharedResultPresentation {
  const presentation = obj(value);
  const classificationValue = presentation.classification;
  const weightValue = presentation.weightReference;
  const result: SharedResultPresentation = {};
  if (classificationValue !== undefined && classificationValue !== null) {
    const classification = obj(classificationValue);
    const rules = arr(classification.rules, 20).map(classificationRule);
    result.classification = {
      label: str(classification.label, 160, true), origin: str(classification.origin, 160, true), source: str(classification.source, 300, true),
      consultationId: uuid(classification.consultationId), marker: finite(classification.marker, 0, 100), low: finite(classification.low), high: finite(classification.high), rules,
    };
  }
  if (typeof presentation.currentReason === 'string' && presentation.currentReason.trim()) result.currentReason = str(presentation.currentReason, 500);
  if (weightValue !== undefined && weightValue !== null) {
    const weight = obj(weightValue);
    const reference: SharedWeightReference = {};
    if (weight.recorded !== undefined && weight.recorded !== null) {
      const recorded = obj(weight.recorded);
      reference.recorded = { value: finite(recorded.value, 0), method: recorded.method === null ? null : str(recorded.method, 240) };
    }
    if (weight.interval !== undefined && weight.interval !== null) {
      const interval = obj(weight.interval);
      reference.interval = { lower: finite(interval.lower, 0), upper: finite(interval.upper, 0), heightCm: finite(interval.heightCm, 1, 300) };
    }
    if (weight.target !== undefined && weight.target !== null) {
      const target = obj(weight.target);
      reference.target = { value: finite(target.value, 0), bmi: finite(target.bmi, 1, 100) };
    }
    result.weightReference = reference;
  }
  return result;
}
/** Construct a patient-only DTO, never forward raw clinical snapshots. */
export function sanitizePortalContent(value: unknown): PortalContent {
  const content = obj(value);
  return {
    goal: str(content.goal, 12000), instructions: str(content.instructions, 12000),
    ...(content.goalSource ? {goalSource:goalSource(content.goalSource)} : {}),
    results: arr(content.results, 60).map(value => {
      const r = obj(value);
      const visualization = r.visualization === undefined || r.visualization === null ? undefined : r.visualization === 'line' || r.visualization === 'somatochart' ? r.visualization : (() => { throw new Error('invalid_input'); })();
      return { id: str(r.id, 500, true), label: str(r.label, 250, true), unit: str(r.unit, 80), method: str(r.method, 300),
        ...(typeof r.conceptCode === 'string' && r.conceptCode.trim() ? { conceptCode: str(r.conceptCode, 120) } : {}),
        ...(visualization ? { visualization } : {}),
        ...(r.presentation !== undefined && r.presentation !== null ? { presentation: resultPresentation(r.presentation) } : {}),
        points: arr(r.points, 100).map(value => {
          const p = obj(value);
          return { consultationId: uuid(p.consultationId), date: date(p.date), value: str(p.value, 120, true), ...(typeof p.classificationLabel === 'string' && p.classificationLabel.trim() ? { classificationLabel: str(p.classificationLabel, 160) } : {}) };
        }),
      };
    }),
    consultations: arr(content.consultations, 100).map(value => {
      const c = obj(value);
      return { id: uuid(c.id), date: date(c.date), title: str(c.title, 160, true), summary: str(c.summary, 2000) };
    }),
  };
}
function goalSource(value:unknown) {
 const source=obj(value);
 if(!Number.isInteger(source.revision)||Number(source.revision)<1||!['objectives','treatment_objective','next_objectives'].includes(String(source.questionKey)))throw new Error('invalid_input');
 return {consultationId:uuid(source.consultationId),revision:Number(source.revision),questionKey:String(source.questionKey)};
}
