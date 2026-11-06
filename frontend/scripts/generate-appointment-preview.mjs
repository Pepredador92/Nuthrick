// Code-native illustration and typography; uses the existing Nuthrick mark.
// Regenerate with: node scripts/generate-appointment-preview.mjs
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const root = new URL('../public/', import.meta.url);
const output = new URL('og/', root);
await mkdir(output, { recursive: true });
const originalLogo = await readFile(new URL('brand/logotipo-ivory.svg', root), 'utf8');
const textStart = originalLogo.indexOf('<text');
const logo = (originalLogo.slice(0, textStart).replaceAll('#f8f5ed', '#d8ee89') + originalLogo.slice(textStart))
  .replace('<svg ', '<svg x="78" y="52" width="236" height="68" ');
const fireflies = [[724,130,3.5],[1087,112,3],[1140,227,4.5],[764,332,3],[1106,423,4],[805,498,3.5],[1027,541,3],[900,121,2],[694,505,2],[1161,520,2.5],[1050,331,2.5]];
const lights = fireflies.map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${r*5}" fill="#d8f58a" opacity=".13" filter="url(#soft)"/><circle cx="${x}" cy="${y}" r="${r}" fill="#e5f7a8"/><circle cx="${x-.5}" cy="${y-.5}" r="${r*.35}" fill="#fff9d8"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">Tu cita está agendada · Nuthrick</title>
  <desc id="description">Una ilustración abstracta de bosque nocturno, luciérnagas y un calendario con una marca de registro. Un paso para cuidar de ti.</desc>
  <defs>
    <linearGradient id="night" x2="1" y2="1"><stop stop-color="#081b22"/><stop offset=".55" stop-color="#102f2e"/><stop offset="1" stop-color="#153d32"/></linearGradient>
    <radialGradient id="clearing"><stop stop-color="#7fa877" stop-opacity=".22"/><stop offset="1" stop-color="#6a936f" stop-opacity="0"/></radialGradient>
    <linearGradient id="stem" x2="0" y2="1"><stop stop-color="#6b9981" stop-opacity=".4"/><stop offset="1" stop-color="#2e5c4a" stop-opacity=".1"/></linearGradient>
    <filter id="soft" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="cardShadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="17"/></filter>
    <g id="plant" fill="none" stroke="url(#stem)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M0 0C-5-101 17-190 0-310"/>
      <path d="M0-34C-62-61-84-99-81-138C-30-125-6-84 0-34Z" fill="#335b4b" fill-opacity=".35"/>
      <path d="M1-64C62-90 91-122 93-165C39-148 14-114 1-64Z" fill="#527c5d" fill-opacity=".32"/>
      <path d="M2-116C-44-140-66-176-64-207C-24-194-5-155 2-116Z" fill="#426e55" fill-opacity=".45"/>
      <path d="M2-156C41-178 62-210 62-240C26-229 11-195 2-156Z" fill="#5a8567" fill-opacity=".3"/>
      <path d="M1-213C-28-233-39-260-35-284C-9-270 0-241 1-213Z" fill="#3c6552" fill-opacity=".5"/>
      <path d="M0-264C28-286 31-315 23-343C3-325-3-294 0-264Z" fill="#588367" fill-opacity=".3"/>
    </g>
  </defs>
  <path fill="url(#night)" d="M0 0h1200v630H0z"/>
  <ellipse cx="959" cy="315" rx="260" ry="290" fill="url(#clearing)"/>
  <!-- Quiet, layered silhouettes frame an open clearing rather than a photo. -->
  <g fill="#071b20" opacity=".5">
    <path d="M1168 0H1200V630H1127C1150 504 1133 381 1140 272C1144 156 1154 73 1168 0Z"/>
    <path d="M1096 0H1109C1104 65 1113 130 1142 193L1136 214C1096 147 1083 63 1096 0Z"/>
    <path d="M1034 0H1048C1064 64 1102 111 1151 144L1145 158C1090 130 1048 79 1034 0Z"/>
  </g>
  <path d="M0 573C178 548 306 614 506 587C690 564 790 550 944 571C1053 586 1130 550 1200 539V630H0Z" fill="#0b2829"/>
  <path d="M638 630C796 539 842 580 969 515C1078 460 1137 482 1200 444" fill="none" stroke="#78a47b" stroke-opacity=".13" stroke-width="45"/>
  <use href="#plant" transform="translate(1148 680) rotate(10) scale(1.55)"/>
  <use href="#plant" transform="translate(774 677) rotate(-15) scale(.8)" opacity=".8"/>
  <use href="#plant" transform="translate(1225 430) rotate(-28) scale(.92)" opacity=".65"/>
  <use href="#plant" transform="translate(15 686) rotate(22) scale(.72)" opacity=".4"/>
  <path d="M755 453C728 398 764 334 790 294C826 238 801 183 844 142" fill="none" stroke="#badb91" stroke-opacity=".15" stroke-width="1.5" stroke-dasharray="2 10"/>
  ${lights}
  ${logo}
  <g font-family="Arial, Helvetica, sans-serif">
    <text x="80" y="193" font-size="15" font-weight="700" letter-spacing="2.7" fill="#d3e5bb">UN PASO PARA CUIDAR DE TI</text>
    <text x="76" y="293" font-size="85" font-weight="700" letter-spacing="-3" fill="#f8f5ed">Tu cita está</text>
    <text x="76" y="391" font-size="98" font-weight="700" letter-spacing="-3.8" fill="#f8f5ed">agendada.</text>
    <text x="80" y="452" font-size="27" fill="#bfcec4">Nos vemos en tu consulta.</text>
    <circle cx="94" cy="535" r="13" fill="#d8ee89"/>
    <path d="m88 535 4 4 8-9" fill="none" stroke="#183e35" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="118" y="541" font-size="18" fill="#dbe8cc">Reserva registrada</text>
  </g>
  <!-- A simple calendar seal makes the appointment legible at thumbnail size. -->
  <ellipse cx="931" cy="332" rx="103" ry="90" fill="#020e15" opacity=".55" filter="url(#cardShadow)"/>
  <circle cx="933" cy="299" r="122" fill="none" stroke="#c6e58c" stroke-opacity=".12"/>
  <circle cx="933" cy="299" r="144" fill="none" stroke="#c6e58c" stroke-opacity=".06"/>
  <rect x="850" y="220" width="164" height="156" rx="27" fill="#14362f" stroke="#b8d6bb" stroke-width="2"/>
  <path d="M850 266H1014M889 208V234M975 208V234" fill="none" stroke="#dceacb" stroke-width="4" stroke-linecap="round"/>
  <g fill="#9cbd9b" opacity=".6"><circle cx="881" cy="292" r="4"/><circle cx="903" cy="292" r="4"/><circle cx="881" cy="314" r="4"/></g>
  <circle cx="984" cy="358" r="44" fill="#d8ee89"/>
  <path d="m964 358 13 13 28-31" fill="none" stroke="#214d3d" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
await writeFile(new URL('appointment-v1.svg', output), svg);
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(new URL('appointment-v1.png', output).pathname);
console.log('Generated public/og/appointment-v1.svg and public/og/appointment-v1.png (1200×630)');
