export type SupplementReference = {
  id: string;
  name: string;
  type: string;
  ingredient: string;
  strength: string;
  presentation: string;
  composition: string;
  verification: string;
  intakeReference: string;
  precautions: string;
  interactions: string;
  source: string;
  clinicalSource: string;
  group: string;
};

export type SupplementSituation = {
  name: string;
  groups: string[];
  assessment: string;
  source: string;
};

type Catalog = {
  products: SupplementReference[];
  monographs: { id: string; ingredient: string }[];
  situations: SupplementSituation[];
};

const constipation = {
  name: "Estreñimiento",
  groups: ["FIB"],
  assessment: "Valora el patrón de evacuación, los signos de alarma y el consumo de fibra y líquidos.",
  source: "https://gastro.org/clinical-guidance/pharmacological-management-of-chronic-idiopathic-constipation-cic/",
};

export async function loadSupplementCatalog(): Promise<Catalog> {
  const { default: catalog } = await import("./catalog.data.json");
  return {
    ...catalog,
    situations: catalog.situations.flatMap(situation => situation.name === "Estreñimiento / intolerancia lactosa"
      ? [constipation, { ...situation, name: "Intolerancia a la lactosa", groups: ["LAC"],
        assessment: "Confirma qué alimentos con lactosa causan síntomas y revisa cómo se usaría la lactasa." }]
      : [situation]),
  };
}

const normalize = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
export function matchesSupplement(query: string, fields: string[]) {
  const text = normalize(fields.join(" "));
  return normalize(query).split(/\s+/).every(word => text.includes(word));
}

const situationAliases: Record<string, string[]> = {
  "Gestación": ["embarazo", "prenatal"],
  "SOP": ["síndrome de ovario poliquístico"],
  "DMAE": ["degeneración macular asociada a la edad"],
  "ERC / polifarmacia": ["enfermedad renal crónica", "polimedicación"],
  "Osteoporosis / déficit D": ["deficiencia de vitamina D", "déficit de vitamina D"],
  "Infección urinaria recurrente": ["ITU", "cistitis recurrente"],
};

export function situationSearchFields(situation: SupplementSituation) {
  return [situation.name, ...(situationAliases[situation.name] ?? [])];
}

export function rankSupplementSearch<T>(rows: T[], query: string, fieldsFor: (row: T) => string[]) {
  const search = normalize(query);
  if (!search) return rows;
  return rows.flatMap(row => {
    const fields = fieldsFor(row).map(normalize);
    const rank = fields[0] === search ? 4
      : fields[0].startsWith(search) ? 3
      : fields.some(field => field.split(/[^\p{L}\p{N}]+/u).some(word => word.startsWith(search))) ? 2
      : search.length > 1 && matchesSupplement(search, fields) ? 1 : 0;
    return rank ? [{ row, rank }] : [];
  }).sort((a, b) => b.rank - a.rank).map(({ row }) => row);
}

export function supplementTag(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 60);
}

export function supplementUnitFromLabel(label: string): "tableta" | "cápsula" | "sobre" | undefined {
  const unit = normalize(label);
  if (/^1 tableta(?: \([^)]*\))?$/.test(unit)) return "tableta";
  if (/^1 capsula(?: \([^)]*\))?$/.test(unit)) return "cápsula";
  if (/^1 sobre(?: \([^)]*\))?$/.test(unit)) return "sobre";
}

const verifiedServing: Record<string, string> = {
  "SUP-117": "2 tabletas (2.7 g)",
  "SUP-128": "1 cápsula (0.392 g)",
  "SUP-169": "1 cápsula (1.8 g)",
};

export function catalogServing(product?: SupplementReference) {
  if (product && verifiedServing[product.id]) return verifiedServing[product.id];
  const presentation = normalize(product?.presentation ?? "");
  if (/\btabletas?\b/.test(presentation)) return "1 tableta";
  if (/\bcapsulas?\b/.test(presentation)) return "1 cápsula";
  if (/\bsobres?\b/.test(presentation)) return "1 sobre";
  return "";
}

export function supplementName(product: SupplementReference) {
  return [product.name, advertisedStrength(product)].filter(Boolean).join(" · ");
}

export function advertisedStrength(product: SupplementReference) {
  return /^(no (indicad|declarad)|pendiente)/i.test(product.strength) ? "" : product.strength;
}

export function sameConcentration(previous: SupplementReference, next: SupplementReference) {
  return previous.name === next.name && previous.ingredient === next.ingredient &&
    previous.group === next.group && !!advertisedStrength(previous) && previous.strength === next.strength &&
    normalize(previous.presentation).replace(/^\d+\s*/, "") === normalize(next.presentation).replace(/^\d+\s*/, "");
}

export const pregnancySource = "https://imss.gob.mx/sites/all/statics/guiasclinicas/028GER.pdf";
const folateSource = "https://www.who.int/tools/elena/interventions/daily-iron-pregnancy";
export type SituationCriteria = { week: string; reviewedPregnancy: boolean; anemia: string; reviewedConstipation: boolean };
export type SupplementSuggestion = {
  group: string;
  recommended: boolean;
  note: string;
  source?: string;
  folateMicrograms?: number;
};

export function situationSuggestions(situations: SupplementSituation[], criteria: SituationCriteria): SupplementSuggestion[] {
  const groups = [...new Set(situations.flatMap(situation => situation.groups).filter(group => group !== "Todos"))];
  const pregnancy = situations.some(situation => situation.name === "Gestación");
  const anemia = situations.some(situation => situation.name === "Anemia");
  const constipationSelected = situations.some(situation => situation.name === constipation.name);
  const requiresIndividualReview = situations.some(situation =>
    ["ERC / polifarmacia", "Electrolitos y enfermedad renal", "Anticoagulación"].includes(situation.name));
  const week = Number(criteria.week);
  const eligiblePregnancy = pregnancy && criteria.reviewedPregnancy &&
    !!criteria.week.trim() && Number.isInteger(week) && week >= 1 && week <= 42;
  return groups.map(group => {
    if (requiresIndividualReview) return { group, recommended: false, note: "Según valoración individual" };
    if (anemia && group === criteria.anemia) {
      return { group, recommended: true,
        note: "Deficiencia confirmada. Registra la pauta terapéutica indicada para esta paciente." };
    }
    if (eligiblePregnancy && !anemia && group === "FOL" && week <= 12) {
      return { group, recommended: true, folateMicrograms: 400, source: folateSource,
        note: "Referencia preventiva habitual · 400 µg de ácido fólico al día. Revisa el aporte del prenatal y la pauta obstétrica." };
    }
    if (eligiblePregnancy && !anemia && group === "FE" && week >= 20) {
      return { group, recommended: true, source: pregnancySource,
        note: "Prevención a partir de la semana 20 según la guía del IMSS. Confirma el hierro elemental y la pauta obstétrica." };
    }
    if (constipationSelected && criteria.reviewedConstipation && !pregnancy && group === "FIB") {
      return { group, recommended: true, source: constipation.source,
        note: "Considera una presentación de psyllium y revisa la hidratación con la persona." };
    }
    return { group, recommended: false, note: "Según valoración" };
  });
}

const possiblePrenatalOverlap = ["FOL", "FE", "FEFOL", "D", "O3", "B12", "CA", "MVM", "VKA"];
export function overlapsWith(first: SupplementReference, second: SupplementReference) {
  if (first.id === second.id || first.group === second.group) return true;
  if ([first.group, second.group].includes("PRE")) {
    return possiblePrenatalOverlap.some(group => [first.group, second.group].includes(group));
  }
  return [first.group, second.group].includes("FEFOL") &&
    ["FE", "FOL", "B12"].some(group => [first.group, second.group].includes(group));
}

export function referenceWarning(product: SupplementReference) {
  return product.id === "SUP-073"
    ? "La ficha comercial muestra concentraciones distintas. Confirma el aporte por tableta directamente en el envase."
    : "Confirma la porción y el aporte en la etiqueta de esta presentación.";
}

export function labeledPreparation(product?: SupplementReference) {
  if (product?.id === "SUP-070") return {
    text: "Disuelve la cantidad indicada en un vaso lleno de agua, revuelve y bébela enseguida.",
    source: "https://www.metamucil.com.mx/es-mx/productos/metamucil-natural-en-bote/",
  };
}
