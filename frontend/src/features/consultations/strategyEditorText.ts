import type { Strategy } from '../../../../supabase/functions/_shared/interventions';

const fields = [
  ['title', 'Nombre de la estrategia', '[Escribe un nombre breve.]'],
  ['action', 'Acción concreta', '[Describe qué trabajarás con la persona.]'],
  ['method', 'Cómo se realizará', '[Describe el método, si ya está definido.]'],
  ['etiologyLink', 'Relación con la causa del PES', '[Explica qué causa aborda la acción, si corresponde.]'],
  ['adaptations', 'Barreras, preferencias y adaptaciones', '[Registra los ajustes que requiera la persona.]'],
  ['monitoring', 'Cómo se valorará el avance', '[Anota qué revisarás para saber si está funcionando.]'],
] as const;

export type StrategyTextField = typeof fields[number][0];
const headings = new Map<string, number>(fields.map(([, title], index) => [title, index]));

export function formatStrategyEditorText(strategy: Strategy, guides = true) {
  return fields.filter(([key]) => guides || strategy[key].trim()).map(([key, title, hint]) => {
    const content = strategy[key].split('\n').map(line => headings.has(line.trim()) ? ' ' + line : line).join('\n');
    return `${title}\n${content || (guides ? hint : '')}`;
  }).join('\n\n');
}

export function readStrategyEditorText(text: string): { fields: Pick<Strategy, StrategyTextField> } | { issue: string } {
  const sections: (string[] | undefined)[] = fields.map(() => undefined);
  let position = -1;
  const structureIssue = 'Conserva los encabezados «Nombre de la estrategia» y «Acción concreta» y escribe debajo de cada uno.';
  for (const line of text.split(/\r?\n/u)) {
    const index = headings.get(line.trimEnd());
    if (index !== undefined) {
      if (index <= position) return { issue: structureIssue };
      position = index;
      sections[index] = [];
    } else if (position >= 0) {
      sections[position]?.push(line.startsWith(' ') && headings.has(line.trim()) ? line.slice(1) : line);
    } else if (line.trim()) {
      return { issue: structureIssue };
    }
  }
  if (!sections[0] || !sections[1]) return { issue: structureIssue };
  const result = {} as Pick<Strategy, StrategyTextField>;
  for (const [index, [key, title, hint]] of fields.entries()) {
    const value = sections[index]?.join('\n').replaceAll(hint, '').trim() ?? '';
    if (value.length > 1500) return { issue: `Resume «${title}» a 1500 caracteres o menos.` };
    result[key] = value;
  }
  return { fields: result };
}

export function strategyFieldOffset(text: string, field: string) {
  const title = fields.find(([key]) => key === field)?.[1];
  if (!title) return null;
  const heading = `${title}\n`;
  if (text.startsWith(heading)) return heading.length;
  const start = text.indexOf(`\n${heading}`);
  return start < 0 ? 0 : start + 1 + heading.length;
}
