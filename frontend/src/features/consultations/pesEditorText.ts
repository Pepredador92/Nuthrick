import type { PesDraft } from './clinicalCopilot';

type PesComponents = Pick<PesDraft, 'problem' | 'etiology' | 'signsSymptoms'>;

const headings = ['Problema', 'Etiología', 'Signos y síntomas'] as const;
const headingKeys = ['problema', 'etiologia', 'signos y sintomas'];

function readHeading(line: string) {
  const normalized = line.trimEnd().replace(/[ \t]*:$/u, '')
    .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return headingKeys.indexOf(normalized);
}

// Indent a heading-like line inside clinical prose so it remains content.
const headingLike = (line: string) => readHeading(line.trimStart()) !== -1;

export function formatPesEditorText(draft: PesComponents) {
  const body = [draft.problem, draft.etiology, draft.signsSymptoms.join('\n')];
  return headings.map((heading, index) => {
    const content = body[index].split('\n').map(line => headingLike(line) ? ' ' + line : line).join('\n');
    return `${heading}\n${content}`;
  }).join('\n\n');
}

export function parsePesEditorText(text: string): PesComponents | null {
  const sections: string[][] = [[], [], []];
  let section = -1;
  for (const line of text.split(/\r?\n/u)) {
    const heading = readHeading(line);
    if (heading !== -1) {
      if (heading !== section + 1) return null;
      section = heading;
    } else if (section >= 0) {
      sections[section].push(line.startsWith(' ') && headingLike(line) ? line.slice(1) : line);
    } else if (line.trim()) {
      return null;
    }
  }
  if (section !== headings.length - 1) return null;
  return {
    problem: sections[0].join('\n').trim(),
    etiology: sections[1].join('\n').trim(),
    signsSymptoms: sections[2].map(line => line.trim()).filter(Boolean),
  };
}

export function pesEtiologyOffset(text: string) {
  let offset = 0;
  for (const line of text.split('\n')) {
    offset += line.length + 1;
    if (readHeading(line) === 1) return Math.min(offset, text.length);
  }
  return 0;
}
