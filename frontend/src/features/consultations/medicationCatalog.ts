type MedicationPresentation = {
  name: string;
  ingredient: string;
  concentration: string;
  presentation: string;
  route: string;
};

type CatalogEntry = MedicationPresentation & {
  row: number;
  indication: string;
  drugClass: string;
  commercialIndication: string;
  sourceSku: string;
  commercialSource: string;
  commercialSourceLevel: string;
  clinicalIndications: string;
  mechanism: string;
  adverseEffects: string;
  followUp: string;
  nutrition: string;
  clinicalSource: string;
  verification: string;
};

type InsulinEntry = Omit<MedicationPresentation, "presentation"> & {
  row: number;
  classification: string;
  device: string;
  mlPerDevice: string;
  devicesPerPack: string;
  unitsPerDevice: string;
  unitsPerPack: string;
  onset: string;
  peak: string;
  duration: string;
  indications: string;
  sourceSku: string;
  commercialSource: string;
  commercialStatus: string;
  actionReference: string;
};

export type MedicationProduct = {
  sku: string;
  entries: CatalogEntry[];
  insulin: InsulinEntry | null;
};

export type MedicationReference = Omit<MedicationPresentation, "route"> & {
  sku: string;
  row: number;
  status: string;
  clinicalSource: string;
};

export type MedicationCatalog = {
  source: string;
  products: MedicationProduct[];
  references: MedicationReference[];
};

type MedicationSelection = Omit<MedicationPresentation, "name"> & { sku: string };

export function loadMedicationCatalog(): Promise<MedicationCatalog> {
  return import("./medicationCatalog.data.json").then((module) => module.default);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .trim();
}

export function searchMedicationCatalog(catalog: MedicationCatalog, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return { products: [], references: [] };
  const tokens = normalizedQuery.split(" ");
  const matches = (text: string) => tokens.every((token) =>
    /^\d+$/.test(token) ? text.split(" ").includes(token) : text.includes(token),
  );

  const products = catalog.products
    .map((product) => {
      const { name, ingredient, concentration, presentation } = product.entries[0];
      const primary = normalize(`${name} ${ingredient}`);
      const strength = normalize(`${primary} ${concentration}`);
      const identity = `${strength} ${normalize(`${presentation} ${product.sku}`)}`;
      const clinical = normalize(
        product.entries.map((entry) => `${entry.indication} ${entry.drugClass} ${entry.sourceSku}`).join(" "),
      );
      const rank = [normalize(name), normalize(ingredient)].includes(normalizedQuery) ? 4
        : matches(primary) ? 3
        : matches(strength) ? 2
        : matches(identity) ? 1
        : matches(`${identity} ${clinical}`) ? 0 : -1;
      return { product, rank };
    })
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => b.rank - a.rank || a.product.entries[0].name.localeCompare(b.product.entries[0].name, "es", { numeric: true }))
    .map(({ product }) => product);
  const references = catalog.references.filter(({ name, ingredient, concentration, presentation }) =>
    matches(normalize(`${name} ${ingredient} ${concentration} ${presentation}`)),
  );
  return { products, references };
}

export function medicationAnswer(product: MedicationProduct): { name: string; catalog: MedicationSelection } {
  const { name, ingredient, concentration, presentation, route } = product.entries[0];
  return { name, catalog: { sku: product.sku, ingredient, concentration, presentation, route } };
}

export function readMedicationSelection(value: unknown): MedicationSelection | undefined {
  if (typeof value !== "object" || value === null) return;
  const { sku, ingredient, concentration, presentation, route } = value as Partial<MedicationSelection>;
  if (typeof sku === "string" && typeof ingredient === "string" &&
    typeof concentration === "string" && typeof presentation === "string" && typeof route === "string") {
    return { sku, ingredient, concentration, presentation, route };
  }
}

const grapefruitAlert = {
  title: "Toronja",
  message: "El jugo de toronja puede elevar la exposición a la simvastatina. Pregunta si el paciente lo consume.",
};

const levodopaAlert = {
  title: "Proteína y absorción",
  message: "Las comidas con alto contenido de proteína pueden afectar la absorción de levodopa. Revisa el horario de toma y la respuesta referida.",
};

const ketoacidosisAlert = {
  title: "Dieta cetogénica e ingesta reducida",
  message: "La dieta cetogénica y una ingesta calórica reducida pueden aumentar el riesgo de cetoacidosis con este medicamento. Revisa estos patrones antes de plantear cambios.",
};

type NutritionAlert = { title: string; message: string; source: string };

const nutritionAlerts: Partial<Record<string, NutritionAlert>> = {
  "levotiroxina": {
    title: "Calcio y hierro",
    message: "El carbonato de calcio y el sulfato ferroso pueden reducir la absorción. Revisa los horarios si el paciente los toma.",
    source: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=251e65e0-6925-4984-9df9-d6d7c6d0703c",
  },
  "simvastatina": {
    ...grapefruitAlert,
    source: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=522d0f7f-f20b-bc17-e063-6294a90a3648&type=display",
  },
  "ezetimiba simvastatina": {
    ...grapefruitAlert,
    source: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=89b860d2-de83-468e-b7e8-76aeec2edca2",
  },
  "alendronato colecalciferol": {
    title: "Alimentos, bebidas y calcio",
    message: "Los alimentos, algunas bebidas y el calcio pueden reducir la absorción del alendronato. Revisa cómo lo toma el paciente.",
    source: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=10307e7e-9a84-4aa1-8c5c-4b209cffe4d1",
  },
  "acenocumarol": {
    title: "Vitamina K",
    message: "La ingesta de alimentos ricos en vitamina K puede influir en el efecto anticoagulante. Revisa el patrón habitual antes de proponer cambios.",
    source: "https://cima.aemps.es/cima/dochtml/ft/88278/FT_88278.html",
  },
  "metformina": {
    title: "Vitamina B12",
    message: "La metformina puede reducir los niveles de vitamina B12. Revisa si el paciente tiene resultados o seguimiento registrado.",
    source: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=c3dfa8a1-d10a-4a1a-8eba-5f4e2a5a2949",
  },
  "levodopa carbidopa": {
    ...levodopaAlert,
    source: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=9b17b028-964a-473c-823d-81423535bd66",
  },
  "levodopa carbidopa entacapona": {
    ...levodopaAlert,
    source: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=9c16c0e0-3b97-486b-b7d5-579f5853e2c5",
  },
  "empagliflozina": {
    ...ketoacidosisAlert,
    source: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=faf3dd6a-9cd0-39c2-0d2e-232cb3f67565",
  },
  "dapagliflozina": {
    ...ketoacidosisAlert,
    source: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=72ad22ae-efe6-4cd6-a302-98aaee423d69",
  },
  "empagliflozina linagliptina": {
    ...ketoacidosisAlert,
    source: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ddbab689-f76c-488c-9613-4168d41dd730",
  },
};

export function medicationNutritionAlert(product: MedicationProduct): NutritionAlert | undefined {
  const { ingredient, concentration, presentation, route } = product.entries[0];
  if (normalize(route) !== "oral") return;
  const active = normalize(ingredient);
  if (active === "orlistat" && concentration === "120 mg" && /\bcápsulas\b/i.test(presentation)) {
    return {
      title: "Vitaminas liposolubles",
      message: "El orlistat puede reducir la absorción de vitaminas liposolubles. Revisa si el paciente tiene indicaciones sobre suplementos y cómo los toma.",
      source: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=6240792b-9224-2d10-e053-2a91aa0a2c3e",
    };
  }
  if (!/\b(tabletas|comprimidos)\b/i.test(presentation)) return;
  if (active === "rivaroxaban" && ["15 mg", "20 mg"].includes(concentration)) {
    return {
      title: "Toma con alimentos",
      message: "La ficha técnica indica tomar con alimentos las tabletas de esta concentración. Confirma cómo toma el medicamento el paciente.",
      source: "https://www.dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=10db92f9-2300-4a80-836b-673e1ae91610",
    };
  }
  return nutritionAlerts[active];
}
