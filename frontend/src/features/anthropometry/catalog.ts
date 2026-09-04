import type {
  MeasurementCategory,
  MeasurementType,
  MeasurementUnit,
} from "./workflowTypes";
export const categoryNames: Record<MeasurementCategory, string> = {
  general: "Generales",
  circumference: "Circunferencias",
  skinfold: "Pliegues",
  diameter: "Diámetros",
  bioimpedance: "Bioimpedancia",
  laboratory: "Laboratorio",
  other: "Otras",
};
const group = (
  category: MeasurementCategory,
  unit: MeasurementUnit,
  max: number,
  rows: Array<[string, string]>,
  decimal_places = 1,
): MeasurementType[] =>
  rows.map(([code, name]) => ({
    id: code,
    code,
    name,
    category,
    unit,
    data_type: "number",
    min_value:
      category === "skinfold" || category === "bioimpedance" ? 0 : 0.001,
    max_value: max,
    decimal_places,
    description:
      category === "bioimpedance"
        ? "Valor reportado por el equipo, no calculado por Nuthrick."
        : "Medición registrada por el profesional.",
    is_active: true,
    created_by: null,
  }));
export const measurementTypes: MeasurementType[] = [
  ...group("general", "kg", 1000, [["weight", "Peso"]]),
  ...group("general", "cm", 300, [["height", "Talla"]]),
  ...group("circumference", "cm", 400, [
    ["waist_circumference", "Cintura"],
    ["hip_circumference", "Cadera"],
    ["abdominal_circumference", "Abdomen"],
    ["relaxed_arm_circumference", "Brazo relajado"],
    ["flexed_arm_circumference", "Brazo contraído"],
    ["thigh_circumference", "Muslo"],
    ["calf_circumference", "Pantorrilla"],
    ["chest_circumference", "Tórax"],
  ]),
  ...group("skinfold", "mm", 150, [
    ["triceps_skinfold", "Tríceps"],
    ["biceps_skinfold", "Bíceps"],
    ["subscapular_skinfold", "Subescapular"],
    ["suprailiac_skinfold", "Suprailíaco"],
    ["supraespinale_skinfold", "Supraespinal"],
    ["abdominal_skinfold", "Abdominal"],
    ["thigh_skinfold", "Muslo anterior"],
    ["calf_skinfold", "Pantorrilla"],
    ["chest_skinfold", "Pectoral"],
    ["midaxillary_skinfold", "Axilar medio"],
  ]),
  ...group(
    "diameter",
    "cm",
    100,
    [
      ["humerus_breadth", "Biepicondilar del húmero"],
      ["femur_breadth", "Biepicondilar del fémur"],
      ["wrist_breadth", "Biestiloideo"],
      ["biacromial_breadth", "Biacromial"],
      ["biiliocristal_breadth", "Biiliocrestal"],
    ],
    2,
  ),
  ...group("bioimpedance", "%", 100, [
    ["body_fat_percentage_device", "Grasa corporal"],
    ["body_water_percentage_device", "Agua corporal"],
    ["right_arm_fat_percentage_device", "Grasa segmental · brazo derecho"],
    ["left_arm_fat_percentage_device", "Grasa segmental · brazo izquierdo"],
    ["trunk_fat_percentage_device", "Grasa segmental · tronco"],
    ["right_leg_fat_percentage_device", "Grasa segmental · pierna derecha"],
    ["left_leg_fat_percentage_device", "Grasa segmental · pierna izquierda"],
  ]),
  ...group("bioimpedance", "kg", 1000, [
    ["fat_mass_device", "Masa grasa"],
    ["fat_free_mass_device", "Masa libre de grasa"],
    ["muscle_mass_device", "Masa muscular"],
    ["skeletal_muscle_mass_device", "Masa muscular esquelética"],
    ["bone_mass_device", "Masa ósea"],
    ["right_arm_lean_mass_device", "Masa magra segmental · brazo derecho"],
    ["left_arm_lean_mass_device", "Masa magra segmental · brazo izquierdo"],
    ["trunk_lean_mass_device", "Masa magra segmental · tronco"],
    ["right_leg_lean_mass_device", "Masa magra segmental · pierna derecha"],
    ["left_leg_lean_mass_device", "Masa magra segmental · pierna izquierda"],
  ]),
  ...group("bioimpedance", "L", 1000, [
    ["total_body_water_device", "Agua corporal total"],
  ]),
  ...group("bioimpedance", "nivel", 1000, [
    ["visceral_fat_device", "Grasa visceral (escala del equipo)"],
  ]),
  ...group(
    "bioimpedance",
    "kcal/día",
    10000,
    [["basal_metabolism_device", "Metabolismo basal reportado"]],
    0,
  ),
  ...group(
    "bioimpedance",
    "años",
    150,
    [["metabolic_age_device", "Edad metabólica reportada"]],
    0,
  ),
  ...group(
    "other",
    "g/cm³",
    2,
    [["body_density_measured", "Densidad corporal obtenida por otro método"]],
    5,
  ),
];
export const legacyCodes: Record<string, string> = {
  weight: "weight",
  height: "height",
  waist: "waist_circumference",
  hip: "hip_circumference",
  chest: "chest_skinfold",
  axillary: "midaxillary_skinfold",
  triceps: "triceps_skinfold",
  subscapular: "subscapular_skinfold",
  suprailiac: "suprailiac_skinfold",
  abdomen: "abdominal_skinfold",
  thigh: "thigh_skinfold",
};
