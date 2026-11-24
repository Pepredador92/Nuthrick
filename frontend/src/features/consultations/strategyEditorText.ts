import { strategyReferences, type Strategy } from '../../../../supabase/functions/_shared/interventions';

const mainFields = [
  ['title', 'Nombre de la estrategia', '[Escribe un nombre breve.]'],
  ['action', 'Acción concreta', '[Describe qué trabajarás con la persona.]'],
  ['method', 'Cómo se realizará', '[Describe el método, si ya está definido.]'],
  ['etiologyLink', 'Relación con la causa del PES', '[Explica qué causa aborda la acción, si corresponde.]'],
  ['adaptations', 'Barreras, preferencias y adaptaciones', '[Registra los ajustes que requiera la persona.]'],
  ['monitoring', 'Cómo se valorará el avance', '[Anota qué revisarás para saber si está funcionando.]'],
] as const;

const detailGroups = [
  ['Aplicación y recursos', [
    ['educationTopic', 'Tema o habilidad'],
    ['materials', 'Materiales y apoyos'],
    ['comprehensionCheck', 'Cómo comprobarás la comprensión'],
    ['composition', 'Dieta, consistencia, composición o producto'],
    ['dose', 'Cantidad o dosis y unidad'],
    ['route', 'Vía de administración'],
    ['access', 'Método de acceso'],
    ['coordinationWith', 'Con quién se coordinará'],
    ['coordinationReason', 'Motivo de la coordinación'],
  ]],
  ['Organización y seguimiento', [
    ['frequency', 'Frecuencia'],
    ['duration', 'Duración prevista'],
    ['startDate', 'Inicio previsto'],
    ['responsible', 'Profesional responsable'],
    ['executor', 'Quién la ejecutará'],
    ['reviewAt', 'Cuándo se revisará'],
    ['adjustmentCriteria', 'Cuándo ajustar o reconsiderar'],
  ]],
  ['Acuerdo con la persona', [
    ['agreement', 'Estado del acuerdo'],
  ]],
  ['Fundamento y referencias', [
    ['referenceNotes', 'Fundamento clínico'],
    ['referenceTitle', 'Guía o protocolo utilizado'],
    ['referenceUrl', 'Enlace de la referencia'],
    ['referenceVersion', 'Versión o año'],
    ['referenceIds', 'Marcos de referencia de la propuesta'],
  ]],
] as const;

type MainField = typeof mainFields[number][0];
type DetailField = typeof detailGroups[number][1][number][0];
export type StrategyTextField = MainField | DetailField;
type StrategyText = Pick<Strategy, StrategyTextField>;

const agreements = {
  pending: 'Pendiente de conversar',
  patient: 'Acordado con la persona',
  caregiver: 'Acordado con cuidador o representante',
} satisfies Record<Strategy['agreement'], string>;
const routes = {
  not_applicable: 'Sin definir',
  oral: 'Oral',
  enteral: 'Enteral',
  parenteral: 'Parenteral',
} satisfies Record<Strategy['route'], string>;
const mainHeadings = new Map<string, MainField>(mainFields.map(([key, title]) => [title, key]));
const groupHeadings = new Set<string>(detailGroups.map(([title]) => title));
const detailHeadings = new Map<string, DetailField>();
const fieldLabels = new Map<StrategyTextField, string>(mainFields.map(([key, title]) => [key, title]));
for (const [, rows] of detailGroups) {
  for (const [key, title] of rows) {
    detailHeadings.set(title, key);
    fieldLabels.set(key, title);
  }
}
const referenceTitles = new Map<string, string>(strategyReferences.map(ref => [ref.id, ref.title]));
const referenceKeys = new Map<string, string>(strategyReferences.map(ref => [ref.title, ref.id]));

function isHeading(line: string) {
  const text = line.trim();
  return mainHeadings.has(text) || groupHeadings.has(text) ||
    (text.includes(':') && detailHeadings.has(text.slice(0, text.indexOf(':'))));
}

function escapeLines(value: string) {
  return value.split('\n').map(line => isHeading(line) ? ` ${line}` : line).join('\n');
}

function detailValue(strategy: Strategy, field: DetailField, guides: boolean): string {
  if (field === 'agreement') return strategy.agreement === 'pending' && !guides ? '' : agreements[strategy.agreement];
  if (field === 'route') return strategy.route === 'not_applicable' ? '' : routes[strategy.route];
  if (field === 'referenceIds') return strategy.referenceIds.map(id => referenceTitles.get(id)).filter(Boolean).join('\n');
  return strategy[field];
}

function formatDetails(strategy: Strategy, guides: boolean, showPendingAgreement = guides) {
  return detailGroups.flatMap(([heading, rows]) => {
    const lines = rows.flatMap(([field, label]) => {
      const value = detailValue(strategy, field, showPendingAgreement);
      if (!value && (!guides || field === 'referenceIds')) return [];
      return [`${label}:${value ? ` ${escapeLines(value)}` : ''}`];
    });
    return lines.length ? [`${heading}\n${lines.join('\n')}`] : [];
  }).join('\n\n');
}

export function formatStrategyEditorText(strategy: Strategy, format: boolean | 'proposal' = true) {
  const guides = format === true;
  const main = mainFields
    .filter(([key]) => guides || strategy[key].trim() || (format === 'proposal' && (key === 'title' || key === 'action')))
    .map(([key, title, hint]) => `${title}\n${escapeLines(strategy[key]) || (guides ? hint : '')}`);
  return [...main, formatDetails(strategy, guides, guides || format === 'proposal')].filter(Boolean).join('\n\n');
}

export function upgradeStrategyEditorText(text: string, strategy: Strategy) {
  const main = text.trimEnd().split(/\r?\n/u).map(line => groupHeadings.has(line.trimEnd()) ? ` ${line}` : line).join('\n');
  return [main, formatDetails(strategy, true)].filter(Boolean).join('\n\n');
}

function choice<T extends string>(labels: Record<T, string>, value: string, fallback: T): T | undefined {
  if (!value) return fallback;
  const normalized = value.toLocaleLowerCase('es');
  return (Object.keys(labels) as T[]).find(key => labels[key].toLocaleLowerCase('es') === normalized);
}

export function readStrategyEditorText(text: string): { fields: StrategyText } | { issue: string; field?: StrategyTextField } {
  const content = new Map<StrategyTextField, string[]>();
  const structureIssue = 'Conserva los encabezados «Nombre de la estrategia» y «Acción concreta» y escribe debajo de cada uno.';
  let current: StrategyTextField | undefined;
  let inDetails = false;
  let looseDetailText = '';
  for (const line of text.split(/\r?\n/u)) {
    const normalized = line.trimEnd();
    const main = mainHeadings.get(normalized);
    const colon = line.indexOf(':');
    const detail = inDetails && colon >= 0 ? detailHeadings.get(line.slice(0, colon)) : undefined;
    const field = main ?? detail;
    if (groupHeadings.has(normalized)) {
      inDetails = true;
      current = undefined;
    } else if (field) {
      if (content.has(field)) return { issue: `Deja un solo «${fieldLabels.get(field)}» en el texto.`, field };
      current = field;
      content.set(field, main ? [] : [line.slice(colon + 1).trimStart()]);
    } else if (current) {
      content.get(current)?.push(line.startsWith(' ') && isHeading(line) ? line.slice(1) : line);
    } else if (line.trim()) {
      if (!inDetails) return { issue: structureIssue };
      looseDetailText ||= line.trim();
    }
  }
  if (!content.has('title') || !content.has('action')) return { issue: structureIssue };
  if (looseDetailText) return { issue: 'En los apartados opcionales, escribe después de la etiqueta que corresponde a cada dato.' };

  const values = new Map<StrategyTextField, string>();
  for (const [field, lines] of content) {
    const hint = mainFields.find(([key]) => key === field)?.[2];
    const value = (hint ? lines.join('\n').replaceAll(hint, '') : lines.join('\n')).trim();
    if (value.length > 1500) return { issue: `Resume «${fieldLabels.get(field)}» a 1500 caracteres o menos.`, field };
    values.set(field, value);
  }
  const agreement = choice(agreements, values.get('agreement') ?? '', 'pending');
  if (!agreement) return {
    issue: 'En Estado del acuerdo, escribe «Pendiente de conversar», «Acordado con la persona» o «Acordado con cuidador o representante».',
    field: 'agreement',
  };
  const route = choice(routes, values.get('route') ?? '', 'not_applicable');
  if (!route) return { issue: 'En Vía de administración, escribe «Oral», «Enteral», «Parenteral» o deja el espacio vacío.', field: 'route' };
  const referenceIds = (values.get('referenceIds') ?? '').split('\n').filter(line => line.trim()).map(line => referenceKeys.get(line.trim()));
  if (referenceIds.some(id => id === undefined)) return {
    issue: 'Escribe las referencias que agregues en «Guía o protocolo utilizado».',
    field: 'referenceIds',
  };
  const referenceUrl = values.get('referenceUrl');
  if (referenceUrl && !/^https:\/\/[^\s]+$/.test(referenceUrl)) return {
    issue: 'En «Enlace de la referencia», escribe una dirección que comience con https:// o deja el espacio vacío.',
    field: 'referenceUrl',
  };

  const fields = Object.fromEntries([...fieldLabels.keys()].map(field => [field, values.get(field) ?? '']));
  return { fields: { ...fields, agreement, route, referenceIds: [...new Set(referenceIds.filter(id => id !== undefined))] } as StrategyText };
}

export function strategyFieldOffset(text: string, field: string) {
  const label = fieldLabels.get(field as StrategyTextField);
  if (!label) return null;
  const heading = mainHeadings.has(label) ? `${label}\n` : `${label}:`;
  if (text.startsWith(heading)) return heading.length;
  const start = text.indexOf(`\n${heading}`);
  return start < 0 ? 0 : start + 1 + heading.length + (text[start + 1 + heading.length] === ' ' ? 1 : 0);
}
