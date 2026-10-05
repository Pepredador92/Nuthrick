/** Nuthrick identity, adapted as native vector geometry from the approved reference.
 * One set of curves for UI, downloadable assets and printed document marks. */
export const brandColors = { forest: '#173f39', ivory: '#f8f5ed', lime: '#d2e89f' };
export const brandArcs = [
  'M 31 89 C 14 81 4 65 4 47 C 4 22 25 3 50 3 C 75 3 96 22 96 47 C 96 65 86 81 69 89',
  'M 28 74 C 17 65 14 52 18 39 C 22 25 35 18 50 18 C 65 18 78 25 82 39 C 86 52 83 65 72 74',
  'M 34 42 C 40 29 60 29 66 42',
];
export const brandPerson = 'M 29 50 C 25 48 23 52 25 57 C 28 65 36 68 39 75 C 41 82 36 94 40 96 C 43 98 47 96 47 93 C 47 87 48 82 50 82 C 52 82 53 87 53 93 C 53 96 57 98 60 96 C 64 94 59 82 61 75 C 64 68 72 65 75 57 C 77 52 75 48 71 50 C 67 52 68 61 58 65 C 53 67 47 67 42 65 C 32 61 33 52 29 50 Z';
export const brandHead = { cx: 50, cy: 50, r: 7.6 };
export function brandSvg(color = brandColors.forest) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -2 102 104" fill="none">${brandArcs.map(d => `<path d="${d}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`).join('')}<circle cx="50" cy="50" r="7.6" fill="${color}"/><path d="${brandPerson}" fill="${color}"/></svg>`;
}
