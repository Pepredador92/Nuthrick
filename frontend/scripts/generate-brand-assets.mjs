// Deterministic code-native brand assets. Run with Node's --experimental-strip-types.
import { brandSvg, brandColors } from '../../supabase/functions/_shared/brand-mark.ts';
import { writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
const root = new URL('../public/', import.meta.url);
await mkdir(new URL('brand/', root), {recursive:true});
for (const [name,color] of Object.entries(brandColors)) {
  await writeFile(new URL(`brand/isotipo-${name}.svg`,root),brandSvg(color));
  const content=brandSvg(color).replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -2 102 104" fill="none">','<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -2 360 104" fill="none">');
  await writeFile(new URL(`brand/logotipo-${name}.svg`,root),content.replace('</svg>',`<text x="113" y="72" font-family="Arial, sans-serif" font-size="60" letter-spacing="-2" font-weight="800" fill="${color}">Nuthrick</text></svg>`));
}
const icon=brandSvg(brandColors.ivory).replace('viewBox="-1 -2 102 104"','viewBox="-18 -19 136 138"').replace('fill="none">','fill="none"><rect x="-18" y="-19" width="136" height="138" rx="28" fill="#173f39"/>');
await writeFile(new URL('favicon.svg',root),icon);
await sharp(Buffer.from(icon)).resize(180,180).png().toFile(new URL('brand/apple-touch-icon.png',root).pathname);
const mark=brandSvg(brandColors.lime).replace('<svg ', '<svg x="88" y="86" width="104" height="104" ');
const social=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#173f39"/><circle cx="1190" cy="560" r="325" fill="none" stroke="#d2e89f" stroke-opacity=".12" stroke-width="70"/><circle cx="1190" cy="560" r="215" fill="none" stroke="#d2e89f" stroke-opacity=".12" stroke-width="50"/>${mark}<g font-family="Arial, sans-serif" fill="#f8f5ed"><text x="216" y="157" font-size="64" font-weight="800" letter-spacing="-3">Nuthrick</text><text x="88" y="314" font-size="57" font-weight="700">Tu consulta, con cada</text><text x="88" y="384" font-size="57" font-weight="700">cosa en su lugar.</text><text x="88" y="505" font-size="26" fill="#d2e89f">Software para nutriólogos</text></g></svg>`;
await sharp(Buffer.from(social)).png().toFile(new URL('og.png',root).pathname);
