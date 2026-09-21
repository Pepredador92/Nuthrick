export type SharedResult = {
  id: string; label: string; unit: string; method: string;
  points: { consultationId: string; date: string; value: string }[];
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
/** Construct a patient-only DTO, never forward raw clinical snapshots. */
export function sanitizePortalContent(value: unknown): PortalContent {
  const content = obj(value);
  return {
    goal: str(content.goal, 12000), instructions: str(content.instructions, 12000),
    ...(content.goalSource ? {goalSource:goalSource(content.goalSource)} : {}),
    results: arr(content.results, 60).map(value => {
      const r = obj(value);
      return { id: str(r.id, 500, true), label: str(r.label, 250, true), unit: str(r.unit, 80), method: str(r.method, 300),
        points: arr(r.points, 100).map(value => {
          const p = obj(value);
          return { consultationId: uuid(p.consultationId), date: date(p.date), value: str(p.value, 120, true) };
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
 if(!Number.isInteger(source.revision)||Number(source.revision)<1||!['objectives','next_objectives'].includes(String(source.questionKey)))throw new Error('invalid_input');
 return {consultationId:uuid(source.consultationId),revision:Number(source.revision),questionKey:String(source.questionKey)};
}
