import type { ObjectiveGoal } from '../../../../supabase/functions/_shared/objectives';

const guidance = {
  outcome: ['Resultado esperado', '[Describe el cambio que quieren lograr.]'],
  etiology: ['Relación con el diagnóstico', '[Explica cómo el cambio aborda la causa del PES.]'],
  target: ['Meta o criterio de logro', '[Define qué resultado concreto indicará un avance.]'],
  indicator: ['Indicador de seguimiento', '[Anota qué van a observar o medir.]'],
  baseline: ['Situación inicial y fecha', '[Anota cómo empiezas y en qué fecha.]'],
  timeframe: ['Plazo de reevaluación', '[Indica cuándo revisarán el avance.]'],
  monitoring: ['Cómo se evaluará', '[Explica cómo registrarán y revisarán el avance.]'],
  feasibility: ['Viabilidad, barreras y preferencias', '[Completa con lo que hablaron en consulta.]'],
} as const;

export type ObjectiveEditorField = keyof typeof guidance;
const groups = [
  ['¿Qué quieren lograr?', ['outcome', 'etiology']],
  ['¿Cómo reconocerán el avance?', ['target', 'indicator', 'baseline']],
  ['¿Cuándo y cómo lo revisarán?', ['timeframe', 'monitoring']],
  ['¿Es viable y lo acordaron?', ['feasibility']],
] as const satisfies ReadonlyArray<readonly [string, readonly ObjectiveEditorField[]]>;
const sections = groups.flatMap(([heading, keys]) => [
  { title: heading, field: null },
  ...keys.map(field => ({ title: guidance[field][0], field })),
]);
const titles = new Set<string>(sections.map(section => section.title));
const hints = new Set<string>(Object.values(guidance).map(([, hint]) => hint));
const previousBaselinePrompts = new Set([
  'Revisa el punto de partida con el primer registro.',
  'Revisa el punto de partida en el PES aprobado y complétalo con el primer registro.',
]);

export function withObjectiveTemplateGaps(goal: ObjectiveGoal) {
  return previousBaselinePrompts.has(goal.baseline.trim()) ? { ...goal, baseline: '' } : goal;
}

export function formatObjectiveEditorText(goal: ObjectiveGoal) {
  return groups.map(([heading, fields]) => [
    heading,
    ...fields.map(field => {
      const [label, hint] = guidance[field];
      const value = goal[field].split('\n')
        .map(line => titles.has(line.trim()) ? ' ' + line : line)
        .join('\n');
      return `${label}\n${value || hint}`;
    }),
  ].join('\n')).join('\n\n');
}

export function readObjectiveEditorText(text: string): { fields: Pick<ObjectiveGoal, ObjectiveEditorField> } | { issue: string } {
  const content: string[][] = sections.map(() => []);
  let index = -1;
  for (const line of text.split(/\r?\n/u)) {
    const title = line.trimEnd();
    if (titles.has(title)) {
      index++;
      if (sections[index]?.title !== title) return { issue: 'Mantén los encabezados de la plantilla en su orden.' };
    } else if (index >= 0 && sections[index].field) {
      content[index].push(line.startsWith(' ') && titles.has(line.trim()) ? line.slice(1) : line);
    } else if (line.trim()) {
      return { issue: 'Escribe la respuesta debajo del nombre de cada campo.' };
    }
  }
  if (index !== sections.length - 1) return { issue: 'Completa o restaura los encabezados de la plantilla.' };
  const fields = {} as Pick<ObjectiveGoal, ObjectiveEditorField>;
  for (const [index, { field, title }] of sections.entries()) {
    if (!field) continue;
    let value = content[index].join('\n');
    for (const hint of hints) value = value.replaceAll(hint, '');
    value = value.trim();
    if (value.length > (field === 'etiology' ? 1500 : 400)) {
      return { issue: `Resume «${title}» para poder aprobar el objetivo.` };
    }
    fields[field] = value;
  }
  return { fields };
}

export function objectiveEditorFieldOffset(text: string, field: ObjectiveEditorField) {
  const label = guidance[field][0];
  const start = text.indexOf(`\n${label}\n`);
  return start < 0 ? 0 : start + label.length + 2;
}
