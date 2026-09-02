import type { ConsultationSnapshotStructure } from "../../types/domain.ts";

type Question =
  ConsultationSnapshotStructure["sections"][number]["questions"][number];
type Section = ConsultationSnapshotStructure["sections"][number];
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  detail?: boolean;
  placeholder?: string;
};
const unknown = "No sabe / no recuerda";
const declined = "Prefiere no responder";
const none = "Ninguno referido";
const yesNo = ["Sí", "No", unknown];
const frequency = [
  "Nunca",
  "Menos de 1 vez por semana",
  "1–2 días por semana",
  "3–4 días por semana",
  "5–6 días por semana",
  "Diario",
  unknown,
];
const conditions = [
  "Obesidad diagnosticada",
  "Diabetes tipo 2",
  "Diabetes tipo 1",
  "Prediabetes",
  "Hipertensión",
  "Dislipidemia",
  "Enfermedad cardiovascular",
  "Enfermedad renal",
  "Enfermedad tiroidea",
  "Enfermedad gastrointestinal",
  "Enfermedad hepática",
  "Cáncer",
  "Otra",
];
const yes = (question_key: string) => ({ question_key, equals: "Sí" });
const has = (question_key: string, contains: string) => ({
  question_key,
  contains,
});
const selected = (
  question_key: string,
  excludes = [none, unknown, declined],
) => ({ question_key, any_except: excludes });
const q = (
  key: string,
  label: string,
  type: Question["question_type"],
  configuration: Record<string, unknown> = {},
  extra: Partial<Question> = {},
): Question => ({
  question_key: key,
  label,
  question_type: type,
  response_area: "patient_reported",
  is_required: false,
  configuration,
  ...extra,
});
const select = (
  key: string,
  label: string,
  options: string[],
  extra: Partial<Question> = {},
) => q(key, label, "select", { options }, extra);
const multi = (
  key: string,
  label: string,
  options: string[],
  extra: Partial<Question> = {},
) =>
  q(
    key,
    label,
    "multi_select",
    {
      options,
      exclusive_options: [
        none,
        unknown,
        declined,
        "Ninguna",
        "No utiliza",
        "Sin dificultades",
      ],
    },
    extra,
  );
const text = (key: string, label: string, extra: Partial<Question> = {}) =>
  q(key, label, "short_text", { max_length: 300 }, extra);
const rows = (
  key: string,
  label: string,
  fields: Field[],
  extra: Partial<Question> = {},
  config: Record<string, unknown> = {},
) =>
  q(
    key,
    label,
    "repeatable_group",
    { fields, add_label: "Agregar registro", ...config },
    extra,
  );
const field = (
  key: string,
  label: string,
  options?: string[],
  extra: Partial<Field> = {},
): Field => ({
  key,
  label,
  type: options ? "select" : "text",
  ...(options ? { options } : {}),
  ...extra,
});
const other = (parent: string, label = "¿Cuál?") =>
  text(`${parent}_other`, label, { visibility_condition: has(parent, "Otra") });
const section = (
  key: string,
  title: string,
  description: string,
  questions: Question[],
): Section => ({ section_key: key, title, description, questions });
const symptoms = [
  "Saciedad temprana",
  "Náuseas",
  "Vómitos",
  "Reflujo",
  "Distensión",
  "Dolor abdominal",
  "Gases",
  "Diarrea",
  "Estreñimiento",
  "Cambios en las heces",
  "Dificultad para masticar",
  "Dificultad para tragar",
];
const generalSymptoms = [
  "Fatiga",
  "Debilidad",
  "Mareo",
  "Sed excesiva",
  "Orina frecuente",
  "Hinchazón / edema",
];
const skinSymptoms = [
  "Caída de cabello",
  "Uñas frágiles",
  "Lesiones en piel o boca",
  "Cambios en la piel",
];
const mealTimes = [
  "Desayuno",
  "Colación matutina",
  "Comida",
  "Colación vespertina",
  "Cena",
  "Consumo nocturno",
  "Otro",
];
const places = [
  "Casa",
  "Trabajo / escuela",
  "Restaurante",
  "Comedor",
  "Calle",
  "En traslado",
  "Otro",
];
const medicationFields = [
  field("name", "Nombre del producto", undefined, { required: true }),
  field("dose", "Dosis y unidad", undefined, {
    placeholder: "Ej. 500 mg; si no se conoce, indícalo",
  }),
  field("frequency", "Frecuencia", [
    "Diario",
    "2 veces al día",
    "3 veces al día",
    "Semanal",
    "Según necesidad",
    "Otra",
    unknown,
  ]),
  field("schedule", "Momento de toma", [
    "En ayunas",
    "Con desayuno",
    "Con comida",
    "Con cena",
    "Antes de dormir",
    "Varios horarios",
    "Otro",
    unknown,
  ]),
  field("reason", "Motivo de uso"),
  field("since", "Desde cuándo", [
    "Menos de 1 mes",
    "1–6 meses",
    "6–12 meses",
    "Más de 1 año",
    unknown,
  ]),
  field(
    "prescriber",
    "Indicado por",
    [
      "Médico/a",
      "Nutriólogo/a",
      "Otro profesional",
      "Por cuenta propia",
      unknown,
    ],
    { detail: true },
  ),
  field("details", "Dosis, horario o indicación adicional", undefined, {
    detail: true,
  }),
];

/** Interview only. No measurements, anthropometric history, diagnosis engine or prescriptions. */
export const initialInterview: ConsultationSnapshotStructure = {
  consultation_type: "initial",
  sections: [
    section(
      "motivo",
      "Motivo y expectativas",
      "Antes de hablar de alimentación, quiero entender qué te trae, qué te preocupa y qué cambio sería valioso para ti. ¿Por qué decidiste venir ahora? Primero escucha; después registra las opciones que mejor describan lo que la persona cuenta.",
      [
        select(
          "main_reason",
          "Motivo principal de la consulta",
          [
            "Mejorar hábitos",
            "Pérdida de peso",
            "Ganancia de peso",
            "Salud metabólica",
            "Diabetes",
            "Hipertensión",
            "Colesterol / triglicéridos",
            "Síntomas digestivos",
            "Rendimiento deportivo",
            "Embarazo / lactancia",
            "Alimentación vegetariana",
            "Otra",
          ],
          { is_required: true },
        ),
        other("main_reason", "Otro motivo de consulta"),
        multi("expectations", "¿Qué le gustaría conseguir?", [
          "Más energía",
          "Mejor digestión",
          "Mejorar glucosa",
          "Mejorar presión arterial",
          "Mejorar lípidos",
          "Organizar comidas",
          "Mejorar rendimiento",
          "Cambiar composición corporal",
          "Mejor relación con la comida",
          "Otra",
          unknown,
        ]),
        other("expectations", "Otra expectativa"),
        select("consult_now", "¿Qué motivó acudir ahora?", [
          "Decisión personal",
          "Recomendación médica",
          "Síntomas recientes",
          "Cambio en estudios",
          "Cambio de etapa de vida",
          "Preocupación familiar",
          "Otra",
          unknown,
        ]),
        other("consult_now", "Otro motivo para acudir ahora"),
        select(
          "problem_onset",
          "¿Desde cuándo está presente el motivo o problema?",
          [
            "Menos de 1 mes",
            "1–6 meses",
            "6–12 meses",
            "Más de 1 año",
            "No hay un problema; busca prevención",
            unknown,
          ],
        ),
        multi("trigger_events", "Cambios que coincidieron con el inicio", [
          "Enfermedad",
          "Embarazo / posparto",
          "Medicamentos",
          "Cambio de trabajo / horarios",
          "Duelo",
          "Lesión",
          "Menos movimiento",
          "Mudanza",
          "Estrés",
          "Problemas de sueño",
          "Cambio de entrenamiento",
          "Cirugía",
          "Otra",
          none,
          unknown,
        ]),
        other("trigger_events", "Otro cambio importante"),
        select(
          "previous_care_status",
          "¿Ha intentado cambios o recibido atención nutricional antes?",
          yesNo,
        ),
        rows(
          "previous_attempts",
          "Experiencias previas: conservar lo útil y evitar repetir dificultades",
          [
            field("approach", "¿Qué intentó?", [
              "Consulta nutricional",
              "Plan por cuenta propia",
              "Aplicación",
              "Programa comercial",
              "Restricción / ayuno",
              "Ejercicio",
              "Otra",
            ]),
            field("result", "¿Qué ocurrió?", [
              "Le ayudó y pudo mantenerlo",
              "Le ayudó temporalmente",
              "No notó cambios",
              "Le resultó difícil",
              "Le generó malestar",
              unknown,
            ]),
            field("helped", "Lo que sí le ayudó", [
              "Acompañamiento",
              "Flexibilidad",
              "Organización",
              "Alimentos de su gusto",
              "Apoyo familiar",
              "Educación",
              "Nada identificado",
              "Otra",
            ]),
            field("difficulty", "Principal dificultad", [
              "Tiempo",
              "Costo",
              "Hambre",
              "Restricción",
              "Falta de apoyo",
              "Horarios",
              "Preparación",
              "Ninguna",
              "Otra",
            ]),
          ],
          { visibility_condition: yes("previous_care_status") },
        ),
        text("opening_words", "En sus propias palabras (opcional)", {
          help_text:
            "Solo una frase si añade información que las opciones no capturan.",
        }),
      ],
    ),
    section(
      "health_history",
      "Antecedentes personales y familiares",
      "¿Qué diagnósticos te han explicado y quién lleva su seguimiento? Separa lo diagnosticado de lo que todavía está en estudio. Después revisemos antecedentes familiares y procedimientos que puedan influir en tu alimentación.",
      [
        select("history_source", "¿Quién aporta la información?", [
          "Paciente",
          "Paciente y acompañante",
          "Madre / padre / tutor",
          "Cuidador/a",
          "Expediente / referencia",
          "Otra",
        ]),
        text("caregiver_relation", "Nombre y parentesco del acompañante", {
          visibility_condition: {
            question_key: "history_source",
            in: [
              "Paciente y acompañante",
              "Madre / padre / tutor",
              "Cuidador/a",
            ],
          },
        }),
        select(
          "medical_history_status",
          "¿Refiere diagnósticos médicos?",
          yesNo,
        ),
        rows(
          "medical_diagnoses_v2",
          "Diagnósticos y seguimiento",
          [
            field("condition", "Diagnóstico", conditions, { required: true }),
            field("other_condition", "Nombre específico / otro diagnóstico"),
            field("since", "Fecha o edad aproximada al diagnóstico"),
            field("status", "Situación", [
              "Diagnosticado",
              "En estudio",
              "Antecedente resuelto",
              unknown,
            ]),
            field("treatment", "Tratamiento actual", [
              "Medicamento",
              "Alimentación / estilo de vida",
              "Ambos",
              "Otro",
              "Sin tratamiento",
              unknown,
            ]),
            field("physician", "Médico o servicio que lo atiende"),
          ],
          {
            visibility_condition: yes("medical_history_status"),
            help_text:
              "Información referida; no convierte una sospecha en diagnóstico confirmado.",
          },
        ),
        select(
          "procedures_status",
          "¿Cirugías, hospitalizaciones o tratamientos relevantes?",
          yesNo,
        ),
        rows(
          "procedures",
          "Procedimientos y hospitalizaciones",
          [
            field("type", "Tipo", [
              "Cirugía digestiva",
              "Cirugía bariátrica",
              "Otra cirugía",
              "Hospitalización",
              "Tratamiento prolongado",
              "Otro",
            ]),
            field("description", "Procedimiento / motivo", undefined, {
              required: true,
            }),
            field("when", "Fecha aproximada"),
            field("effects", "Repercusiones actuales en alimentación"),
          ],
          { visibility_condition: yes("procedures_status") },
        ),
        select("life_stage", "Etapa o situación relevante (si corresponde)", [
          "Ninguna particular",
          "Embarazo",
          "Lactancia",
          "Posparto",
          "Infancia / adolescencia",
          "Persona mayor",
          "Otra",
          declined,
        ]),
        text("life_stage_context", "Contexto relevante de esta etapa", {
          visibility_condition: {
            question_key: "life_stage",
            any_except: ["Ninguna particular", declined],
          },
          help_text:
            "Ej. semanas de gestación o apoyo para la alimentación. No solicita medidas corporales.",
        }),
        select(
          "family_history_status",
          "¿Conoce antecedentes familiares relevantes?",
          yesNo,
        ),
        rows(
          "family_conditions_v2",
          "Antecedentes por familiar",
          [
            field(
              "relative",
              "Parentesco",
              [
                "Madre",
                "Padre",
                "Hermano/a",
                "Abuelo/a materno/a",
                "Abuelo/a paterno/a",
                "Hijo/a",
                "Otro",
              ],
              { required: true },
            ),
            field("condition", "Enfermedad", conditions, { required: true }),
            field("age", "Edad aproximada al inicio"),
            field("details", "Otro diagnóstico / parentesco", undefined, {
              detail: true,
            }),
          ],
          { visibility_condition: yes("family_history_status") },
        ),
      ],
    ),
    section(
      "treatments",
      "Medicamentos y suplementos",
      "Incluyamos lo recetado y lo que tomas por tu cuenta: vitaminas, proteínas, creatina, hierbas, productos de farmacia y productos para cambiar el peso. Si no recuerdas un dato, podemos dejarlo pendiente de verificar; no hace falta adivinarlo.",
      [
        select("medication_status", "¿Usa medicamentos actualmente?", yesNo),
        rows(
          "medication_list_v2",
          "Medicamentos actuales",
          medicationFields,
          { visibility_condition: yes("medication_status") },
          { add_label: "Agregar medicamento" },
        ),
        multi("supplement_types", "Suplementos o productos utilizados", [
          "Vitaminas / minerales",
          "Proteína",
          "Creatina",
          "Hierbas / infusiones concentradas",
          "Productos para bajar de peso",
          "Productos de venta libre",
          "Otro",
          "No utiliza",
          unknown,
        ]),
        rows(
          "supplement_list_v2",
          "Suplementos y otros productos",
          medicationFields,
          {
            visibility_condition: selected("supplement_types", [
              "No utiliza",
              unknown,
            ]),
          },
          { add_label: "Agregar producto" },
        ),
        select(
          "treatment_changes",
          "¿Cambios recientes o efectos que afecten apetito / digestión?",
          [
            "Sin cambios ni efectos referidos",
            "Cambió medicamento / dosis",
            "Refiere efectos",
            "Cambios y efectos",
            unknown,
          ],
        ),
        text(
          "treatment_effect_details",
          "Producto y cambio o efecto referido",
          {
            visibility_condition: {
              question_key: "treatment_changes",
              in: [
                "Cambió medicamento / dosis",
                "Refiere efectos",
                "Cambios y efectos",
              ],
            },
          },
        ),
        multi(
          "treatment_verification",
          "Información pendiente de verificar",
          [
            "Nombre",
            "Dosis",
            "Frecuencia",
            "Horario",
            "Indicación",
            "Fotografía / receta del producto",
            "Ninguna",
          ],
          { response_area: "professional_assessment" },
        ),
      ],
    ),
    section(
      "symptoms",
      "Apetito y síntomas",
      "¿Has notado molestias al comer, digerir o evacuar? Pregunta por los síntomas presentes y detalla solo los relevantes. Distingue lo que refiere la persona de lo observado; estas respuestas no generan diagnósticos automáticos.",
      [
        select("appetite", "Apetito y cambios recientes", [
          "Sin cambios",
          "Menor apetito",
          "Mayor apetito",
          "Variable",
          unknown,
        ]),
        multi("digestive_screen", "Síntomas digestivos referidos", [
          ...symptoms,
          none,
          unknown,
        ]),
        select("bowel_frequency", "Frecuencia habitual de evacuaciones", [
          "Más de 3 al día",
          "1–3 al día",
          "Cada 2 días",
          "3 o menos por semana",
          "Muy variable",
          unknown,
        ]),
        multi("general_symptoms", "Síntomas generales referidos", [
          ...generalSymptoms,
          none,
          unknown,
        ]),
        multi("skin_hair_nails", "Cambios en piel, cabello, uñas o boca", [
          ...skinSymptoms,
          none,
          unknown,
        ]),
        rows(
          "symptom_details_v2",
          "Caracterizar los síntomas relevantes",
          [
            field(
              "symptom",
              "Síntoma",
              [
                ...symptoms,
                ...generalSymptoms,
                ...skinSymptoms,
                "Cambio de apetito",
                "Otro",
              ],
              { required: true },
            ),
            field("onset", "Desde cuándo", [
              "Días",
              "Semanas",
              "Meses",
              "Años",
              unknown,
            ]),
            field("frequency", "Frecuencia", [
              "Ocasional",
              "Varias veces por semana",
              "Diario",
              "Con alimentos específicos",
              unknown,
            ]),
            field("impact", "Impacto referido", [
              "No limita",
              "Interfiere parcialmente",
              "Limita comer / beber / actividades",
              unknown,
            ]),
            field("triggers", "Alimentos o situaciones asociados"),
            field("care", "Atención recibida", [
              "Ya evaluado",
              "En seguimiento",
              "No evaluado",
              unknown,
            ]),
            field("notes", "Otros detalles", undefined, { detail: true }),
          ],
          {
            visibility_condition: {
              any: [
                selected("digestive_screen"),
                selected("general_symptoms"),
                selected("skin_hair_nails"),
                {
                  question_key: "appetite",
                  in: ["Menor apetito", "Mayor apetito", "Variable"],
                },
              ],
            },
          },
          { add_label: "Detallar síntoma" },
        ),
        select(
          "symptom_action",
          "Criterio profesional: ¿requiere valoración adicional?",
          [
            "No se identifica necesidad en esta entrevista",
            "Solicitar información adicional",
            "Coordinar valoración médica",
            "Valoración prioritaria según criterio clínico",
            "Pendiente de valorar",
          ],
          {
            response_area: "professional_assessment",
            help_text:
              "La urgencia y las decisiones clínicas corresponden al profesional; no es un sistema de triaje.",
          },
        ),
      ],
    ),
    section(
      "sleep",
      "Sueño y descanso",
      "Repasemos una noche habitual: a qué hora te acuestas, cuándo despiertas y cómo te sientes durante el día. Me interesa cómo el descanso influye en tu energía, hambre, horarios y posibilidades de cambio, no etiquetar un trastorno.",
      [
        q("bedtime", "Hora habitual de acostarse", "time"),
        q("waketime", "Hora habitual de despertar", "time"),
        select("sleep_hours", "Horas reales de sueño", [
          "Menos de 4",
          "4–5",
          "5–6",
          "6–7",
          "7–8",
          "8–9",
          "Más de 9",
          unknown,
        ]),
        select("sleep_continuity", "Continuidad del sueño", [
          "Continuo",
          "Despertares ocasionales",
          "Despertares frecuentes",
          "Dificultad para conciliarlo",
          "Horario muy variable",
          unknown,
        ]),
        select("sleep_rested", "¿Despierta descansado/a?", [
          "Casi siempre",
          "A veces",
          "Casi nunca",
          unknown,
        ]),
        multi("sleep_signals", "Situaciones referidas durante el sueño", [
          "Ronquidos",
          "Pausas respiratorias comentadas por otra persona",
          "Somnolencia diurna",
          "Despertar para comer",
          none,
          unknown,
        ]),
        select("night_shifts", "¿Trabaja turnos nocturnos o rotatorios?", [
          "No",
          "Nocturnos",
          "Rotatorios",
          "Ocasionales",
        ]),
        multi("sleep_impact", "¿En qué influye el descanso?", [
          "Energía",
          "Hambre / antojos",
          "Horarios para comer",
          "Entrenamiento",
          "Concentración",
          "Ninguna",
          unknown,
        ]),
      ],
    ),
    section(
      "activity",
      "Movimiento y ejercicio",
      "Diferenciemos tu movimiento diario del ejercicio planeado. ¿Cómo transcurre tu jornada y cómo te trasladas? Si entrenas, revisemos tipo, frecuencia, duración e intensidad. Consideremos lesiones o limitaciones antes de plantear cambios.",
      [
        select("daily_activity", "Actividad cotidiana predominante", [
          "Principalmente sentado/a",
          "Alterna sentado/a y de pie",
          "Principalmente de pie",
          "Trabajo físico",
          "Variable",
          unknown,
        ]),
        select("sitting_time", "Tiempo sentado al día", [
          "Menos de 2 horas",
          "2–4 horas",
          "4–6 horas",
          "6–8 horas",
          "Más de 8 horas",
          unknown,
        ]),
        multi("transport", "Traslados habituales", [
          "Caminando",
          "Bicicleta",
          "Transporte público",
          "Automóvil / motocicleta",
          "No realiza traslados",
          "Otro",
        ]),
        q("known_steps", "Pasos diarios, si los conoce (opcional)", "number", {
          min: 0,
          max: 100000,
          step: 1,
        }),
        select("exercise_status", "¿Realiza ejercicio planeado?", yesNo),
        rows(
          "exercise_sessions",
          "Rutina de ejercicio",
          [
            field(
              "type",
              "Tipo",
              [
                "Caminata",
                "Carrera",
                "Bicicleta",
                "Natación",
                "Fuerza / pesas",
                "Deporte de equipo",
                "Baile",
                "Movilidad / yoga",
                "Otro",
              ],
              { required: true },
            ),
            field("days", "Días por semana", [
              "1",
              "2",
              "3",
              "4",
              "5",
              "6",
              "7",
            ]),
            field("minutes", "Minutos por sesión", undefined, {
              type: "number",
              min: 1,
              max: 1440,
            }),
            field("intensity", "Intensidad percibida", [
              "Ligera",
              "Moderada",
              "Vigorosa",
              "Variable",
              unknown,
            ]),
            field("time", "Horario", [
              "Mañana",
              "Mediodía",
              "Tarde",
              "Noche",
              "Variable",
            ]),
            field("experience", "Desde cuándo", [
              "Menos de 1 mes",
              "1–6 meses",
              "6–12 meses",
              "Más de 1 año",
              unknown,
            ]),
            field("goal", "Objetivo", [
              "Salud",
              "Disfrute",
              "Fuerza",
              "Rendimiento / competencia",
              "Composición corporal",
              "Rehabilitación",
              "Otro",
            ]),
            field("details", "Otro tipo / detalles", undefined, {
              detail: true,
            }),
          ],
          { visibility_condition: yes("exercise_status") },
          { add_label: "Agregar actividad" },
        ),
        select(
          "strength_training",
          "¿Incluye entrenamiento de fuerza?",
          yesNo,
          {
            visibility_condition: yes("exercise_status"),
            help_text:
              "Si responde sí, registra también días y duración como actividad de fuerza arriba.",
          },
        ),
        multi("activity_limitations", "Limitaciones para moverse o entrenar", [
          "Dolor",
          "Lesión",
          "Condición médica",
          "Discapacidad / movilidad reducida",
          "Falta de tiempo",
          "Falta de acceso",
          "Temor / inseguridad",
          none,
          declined,
        ]),
        text(
          "activity_limit_details",
          "Limitación, cuidados o indicaciones relevantes",
          { visibility_condition: selected("activity_limitations") },
        ),
      ],
    ),
    section(
      "substances",
      "Alcohol, tabaco y otras sustancias",
      "Estas preguntas ayudan a entender tu rutina y se hacen sin juicios. No basta con saber si consumes algo: importa qué, cuánto y con qué frecuencia. Puedes indicar que prefieres no responder.",
      [
        select("alcohol_status", "Consumo de alcohol", [
          "No consume",
          "Consumió antes",
          "Consume actualmente",
          declined,
        ]),
        rows(
          "alcohol_pattern",
          "Patrón de consumo de alcohol",
          [
            field("type", "Bebida", [
              "Cerveza",
              "Vino",
              "Destilados",
              "Cócteles",
              "Otra",
            ]),
            field("amount", "Cantidad por ocasión", undefined, {
              placeholder: "Ej. 2 botellas de 355 mL",
            }),
            field("frequency", "Frecuencia", [
              "Menos de una vez al mes",
              "1–3 veces al mes",
              "1–2 días por semana",
              "3–4 días por semana",
              "5–7 días por semana",
              unknown,
            ]),
          ],
          {
            visibility_condition: {
              question_key: "alcohol_status",
              equals: "Consume actualmente",
            },
            help_text:
              "Conservar cantidad y tamaño de la bebida; no convertir automáticamente a unidades estándar.",
          },
        ),
        select(
          "alcohol_high_episodes",
          "¿Ocasiones en que consume mucho más de lo habitual?",
          ["No", "Ocasionalmente", "Frecuentemente", unknown, declined],
          {
            visibility_condition: {
              question_key: "alcohol_status",
              equals: "Consume actualmente",
            },
          },
        ),
        text(
          "alcohol_high_details",
          "Cantidad y frecuencia de esas ocasiones",
          {
            visibility_condition: {
              question_key: "alcohol_high_episodes",
              in: ["Ocasionalmente", "Frecuentemente"],
            },
          },
        ),
        select("tobacco_status", "Tabaco o nicotina", [
          "No consume",
          "Consumió antes",
          "Consume actualmente",
          declined,
        ]),
        rows(
          "tobacco_pattern",
          "Producto, cantidad y frecuencia",
          [
            field("type", "Producto", [
              "Cigarrillos",
              "Vapeador",
              "Tabaco calentado",
              "Otro",
            ]),
            field("amount", "Cantidad aproximada"),
            field("frequency", "Frecuencia", [
              "Diario",
              "Algunos días",
              "Ocasional",
              unknown,
            ]),
            field("since", "Desde cuándo"),
          ],
          {
            visibility_condition: {
              question_key: "tobacco_status",
              equals: "Consume actualmente",
            },
          },
        ),
        select(
          "other_substances_status",
          "¿Otras sustancias que considere relevante comentar?",
          [...yesNo, declined],
        ),
        rows(
          "other_substances",
          "Información referida sobre otras sustancias",
          [
            field("name", "Sustancia"),
            field("amount", "Cantidad"),
            field("frequency", "Frecuencia"),
            field("context", "Contexto / efecto en alimentación"),
          ],
          { visibility_condition: yes("other_substances_status") },
        ),
      ],
    ),
    section(
      "recall",
      "Recordatorio de 24 horas",
      "Primero escucha todo lo que comió y bebió desde que despertó hasta que se durmió, sin interrumpir. Después busca olvidos, completa horarios y cantidades, y revisa al final. Es un día concreto: no lo confundas con el consumo habitual ni calcules nutrientes sin una fuente de composición.",
      [
        q("recall_date", "Día al que corresponde el recordatorio", "date"),
        select("recall_day_type", "¿Cómo fue ese día?", [
          "Habitual entre semana",
          "Habitual de fin de semana",
          "Diferente por trabajo / viaje",
          "Enfermedad / poco apetito",
          "Celebración / evento",
          "Otro",
          unknown,
        ]),
        rows(
          "recall_24h_v2",
          "1. Lista rápida · 3. Horarios · 4. Detalles",
          [
            field("food", "Alimento o bebida", undefined, {
              required: true,
              placeholder: "Anota primero lo que recuerda",
            }),
            field("occasion", "Ocasión", mealTimes),
            field("time", "Hora", undefined, { type: "time" }),
            field("amount", "Cantidad y tamaño", undefined, {
              placeholder: "Ej. 1 taza, 2 tortillas, 1 pieza mediana",
            }),
            field(
              "preparation",
              "Preparación",
              [
                "Crudo",
                "Hervido / vapor",
                "Asado / plancha",
                "Horneado",
                "Frito",
                "Guisado",
                "Envasado",
                "Otra",
                unknown,
              ],
              { detail: true },
            ),
            field("brand", "Marca (si aplica)", undefined, { detail: true }),
            field("ingredients", "Ingredientes / aceite / azúcar", undefined, {
              detail: true,
            }),
            field("accompaniments", "Salsas y acompañamientos", undefined, {
              detail: true,
            }),
            field("place", "Lugar", places, { detail: true }),
          ],
          {
            help_text:
              "Un registro por alimento o preparación. “Completar detalles” permite hacer la segunda pasada sin perder la lista rápida.",
          },
          { add_label: "Agregar alimento o bebida" },
        ),
        multi(
          "recall_forgotten_review",
          "2. Buscar olvidos: categorías que ya se preguntaron",
          [
            "Bebidas / agua",
            "Snacks / dulces",
            "Salsas / aderezos",
            "Aceites / grasas",
            "Alcohol",
            "Café / té",
            "Leche / azúcar añadida",
            "Probaditas al cocinar",
          ],
          {
            help_text:
              "Marcar significa que se revisó, no que lo consumió. Si recuerda algo, agrégalo en la lista.",
            response_area: "professional_assessment",
          },
        ),
        select(
          "recall_final_check",
          "5. ¿Falta algo por anotar de lo que comió o bebió?",
          [
            "Revisado; no recuerda más",
            "Agregó alimentos y se revisó de nuevo",
            "Pendiente de completar",
          ],
          { response_area: "professional_assessment" },
        ),
      ],
    ),
    section(
      "habitual",
      "Alimentación habitual e hidratación",
      "Ahora salgamos de ese día y pensemos en las últimas semanas. ¿Qué comidas se repiten y qué cambia el fin de semana? La frecuencia indica cuántos días suele consumir un grupo; no equivale a porciones ni a una evaluación automática de la calidad de la dieta.",
      [
        multi("usual_pattern", "Tiempos de comida que acostumbra realizar", [
          "Desayuno",
          "Colación matutina",
          "Comida",
          "Colación vespertina",
          "Cena",
          "Consumo nocturno",
          "Variable / sin patrón",
        ]),
        rows(
          "usual_meals",
          "Horarios y opciones habituales",
          [
            field("occasion", "Tiempo de comida", mealTimes, {
              required: true,
            }),
            field("time", "Hora aproximada", undefined, { type: "time" }),
            field("frequency", "Frecuencia", frequency),
            field("foods", "Opciones que se repiten"),
            field("weekend", "Cambio en fin de semana", [
              "Sin cambio",
              "Más tarde",
              "Más temprano",
              "Omite este tiempo",
              "Come fuera",
              "Variable",
            ]),
          ],
          {},
          { add_label: "Agregar tiempo de comida" },
        ),
        q(
          "food_frequency_v2",
          "Frecuencia habitual por grupo",
          "repeatable_group",
          {
            widget: "frequency_grid",
            items: [
              "Verduras",
              "Frutas",
              "Leguminosas",
              "Cereales integrales",
              "Lácteos / alternativas",
              "Carne roja",
              "Pollo / aves",
              "Pescado / mariscos",
              "Huevo",
              "Embutidos",
              "Comida rápida",
              "Dulces",
              "Panadería",
              "Bebidas azucaradas",
              "Alcohol",
              "Agua simple",
            ],
            options: frequency,
          },
          {
            help_text:
              "Cada grupo tiene su propia frecuencia. Deja sin responder lo que todavía no se haya explorado.",
          },
        ),
        rows(
          "daily_drinks",
          "Cantidad habitual de líquidos",
          [
            field(
              "drink",
              "Bebida",
              [
                "Agua simple",
                "Refresco",
                "Jugo",
                "Agua endulzada",
                "Café",
                "Té",
                "Leche",
                "Bebida energética",
                "Otra",
              ],
              { required: true },
            ),
            field("quantity", "Cantidad al día", undefined, {
              type: "number",
              min: 0,
              max: 100000,
            }),
            field("unit", "Unidad", [
              "mL",
              "L",
              "Vasos",
              "Tazas",
              "Botellas",
              "Latas",
            ]),
            field("size", "Tamaño del recipiente (si se conoce)"),
            field("sugar", "Azúcar / endulzante", [
              "Sin añadir",
              "Azúcar",
              "Edulcorante",
              "Producto ya endulzado",
              unknown,
            ]),
          ],
          {
            help_text:
              "No se presupone que todos los vasos o botellas tengan el mismo volumen.",
          },
          { add_label: "Agregar bebida" },
        ),
      ],
    ),
    section(
      "routine",
      "Horarios y posibilidades reales",
      "Diseñemos alrededor de tu día real. ¿Cuándo puedes comer, cuánto tiempo tienes y dónde? Revisemos trabajo, estudio, cuidados y días distintos. Esta información permite proponer acuerdos que sí quepan en tu rutina.",
      [
        select("occupation_context", "Actividad principal", [
          "Trabajo con horario fijo",
          "Trabajo con horario variable",
          "Estudio",
          "Trabajo y estudio",
          "Cuidados / hogar",
          "Jubilación",
          "Otra",
          declined,
        ]),
        q("leave_home", "Hora habitual de salir de casa (si aplica)", "time"),
        rows(
          "daily_schedule",
          "Jornada y ventanas reales para comer",
          [
            field("day", "Día / tipo de jornada", [
              "Entre semana",
              "Fin de semana",
              "Turno matutino",
              "Turno vespertino",
              "Turno nocturno",
              "Día variable",
              "Otro",
            ]),
            field("start", "Inicio de trabajo / estudio", undefined, {
              type: "time",
            }),
            field("end", "Fin de trabajo / estudio", undefined, {
              type: "time",
            }),
            field("meal_window", "Horario o ventana disponible para comer"),
            field("minutes", "Tiempo disponible", [
              "Menos de 10 minutos",
              "10–20 minutos",
              "20–30 minutos",
              "Más de 30 minutos",
              "Variable",
            ]),
            field("place", "Lugar habitual", places),
          ],
          {},
          { add_label: "Agregar jornada" },
        ),
        multi("food_equipment", "Recursos disponibles fuera de casa", [
          "Refrigerador",
          "Microondas / forma de calentar",
          "Agua potable",
          "Lugar para guardar alimentos",
          "Comedor",
          "No come fuera de casa",
          "Ninguna",
          unknown,
        ]),
        multi("food_preparer", "¿Quién prepara los alimentos?", [
          "Paciente",
          "Pareja",
          "Familia",
          "Cuidador/a",
          "Comedor / restaurante",
          "Compra alimentos preparados",
          "Otra",
        ]),
        other("food_preparer", "¿Quién más prepara los alimentos?"),
        select("cooking_time", "Tiempo disponible para preparar", [
          "Menos de 15 minutos",
          "15–30 minutos",
          "30–60 minutos",
          "Más de 1 hora",
          "Puede cocinar por lotes",
          "No puede cocinar",
          "Variable",
        ]),
        multi("schedule_constraints", "Barreras de la rutina", [
          "Horarios de trabajo",
          "Traslados",
          "Cuidados de otras personas",
          "Turnos nocturnos",
          "Viajes",
          "Tiempo corto para comer",
          "Horarios cambiantes",
          "Eventos sociales",
          "Ninguna",
          "Otra",
        ]),
        other("schedule_constraints", "Otra barrera de horarios"),
      ],
    ),
    section(
      "preferences",
      "Preferencias, alergias y restricciones",
      "¿Qué alimentos disfrutas, cuáles evitas y cuáles quisieras conservar? Separa una alergia confirmada de una intolerancia diagnosticada o una molestia percibida. Las preferencias culturales o religiosas solo se registran si la persona desea compartirlas.",
      [
        multi("eating_preferences", "Patrón y preferencias", [
          "Omnívoro",
          "Vegetariano",
          "Vegano",
          "Pescetariano",
          "Flexitariano",
          "Preferencia cultural / regional",
          "Restricción religiosa",
          "Otra",
          declined,
        ]),
        rows(
          "food_preferences",
          "Alimentos que debemos tomar en cuenta",
          [
            field(
              "category",
              "Categoría",
              [
                "Favorito",
                "No le gusta",
                "No consume",
                "No quiere dejar",
                "Preferencia cultural / religiosa",
              ],
              { required: true },
            ),
            field("food", "Alimento o preparación", undefined, {
              required: true,
            }),
            field("reason", "Motivo, si desea comentarlo"),
          ],
          {},
          { add_label: "Agregar preferencia" },
        ),
        select(
          "food_reactions_status",
          "¿Alergias, intolerancias o reacciones a alimentos?",
          yesNo,
        ),
        rows(
          "food_reactions_v2",
          "Reacciones: distinguir confirmación y percepción",
          [
            field("food", "Alimento / ingrediente", undefined, {
              required: true,
            }),
            field(
              "classification",
              "Tipo de antecedente",
              [
                "Alergia confirmada",
                "Sospecha de alergia",
                "Intolerancia diagnosticada",
                "Intolerancia percibida",
                "Otra reacción",
              ],
              { required: true },
            ),
            field("reaction", "Reacción referida"),
            field("confirmed_by", "Quién confirmó / cómo se evaluó"),
            field("management", "Manejo actual", [
              "Evita el alimento",
              "Limita cantidad",
              "Usa sustituto",
              "Indicación médica",
              "Sin manejo",
              "Otro",
            ]),
            field("details", "Detalles relevantes", undefined, {
              detail: true,
            }),
          ],
          { visibility_condition: yes("food_reactions_status") },
        ),
      ],
    ),
    section(
      "access",
      "Compra, presupuesto y apoyo",
      "Antes de proponer alimentos, quiero saber qué es accesible para ti y qué presupuesto debemos respetar. Puedes no responder lo que no desees. Estas preguntas describen el contexto; no son una escala validada de inseguridad alimentaria.",
      [
        multi("food_buyer", "¿Quién compra los alimentos?", [
          "Paciente",
          "Pareja",
          "Familia",
          "Cuidador/a",
          "Otra",
        ]),
        multi("shopping_places", "¿Dónde suelen comprar?", [
          "Mercado / tianguis",
          "Supermercado",
          "Tienda de barrio",
          "Compra en línea",
          "Productor local",
          "Apoyo alimentario",
          "Otra",
        ]),
        select("budget_constraint", "¿El presupuesto limita las opciones?", [
          "No habitualmente",
          "A veces",
          "Con frecuencia",
          unknown,
          declined,
        ]),
        text("food_budget", "Presupuesto a respetar (opcional)", {
          help_text:
            "Si la persona lo desea: monto, moneda, periodo y para cuántas personas.",
        }),
        multi(
          "access_barriers",
          "Dificultades para conseguir o preparar alimentos",
          [
            "Costo",
            "Distancia / transporte",
            "Disponibilidad regional",
            "Tiempo para comprar",
            "Falta de refrigeración",
            "Equipo para cocinar",
            "Agua potable",
            "Movilidad",
            "Sin dificultades",
            declined,
          ],
        ),
        text(
          "unavailable_foods",
          "Alimentos que no están disponibles (opcional)",
        ),
        select(
          "food_shortage",
          "¿Hay momentos en que faltan alimentos por recursos?",
          ["No refiere", "Ocasionalmente", "Frecuentemente", unknown, declined],
        ),
        multi("support_network", "Apoyos disponibles para hacer cambios", [
          "Familia",
          "Pareja",
          "Amistades",
          "Compañeros",
          "Cuidador/a",
          "Recursos comunitarios",
          "Ninguno referido",
          declined,
        ]),
      ],
    ),
    section(
      "eating_behavior",
      "Relación con la comida",
      "Hablemos de cómo te sientes al comer, sin juzgar. ¿Puedes reconocer hambre y saciedad? ¿Influyen el estrés o las emociones? Si surgen dificultades, explóralas con cuidado y considera apoyo interdisciplinario. Este bloque no diagnostica un trastorno de la conducta alimentaria ni sustituye un instrumento validado.",
      [
        select(
          "food_relationship",
          "¿Cómo describe su relación con la comida?",
          [
            "Tranquila / flexible",
            "Con preocupación",
            "Con reglas rígidas",
            "Variable",
            "Le cuesta describirla",
            declined,
          ],
        ),
        multi("eating_drivers", "Situaciones que influyen al comer", [
          "Hambre",
          "Estrés",
          "Ansiedad",
          "Aburrimiento",
          "Tristeza",
          "Celebración",
          "Disponibilidad de comida",
          "Presión social",
          "Otra",
          declined,
        ]),
        select("hunger_recognition", "¿Reconoce señales de hambre?", [
          "Habitualmente",
          "A veces",
          "Le cuesta reconocerlas",
          unknown,
          declined,
        ]),
        select("satiety_recognition", "¿Reconoce cuándo está satisfecho/a?", [
          "Habitualmente",
          "A veces",
          "Le cuesta reconocerlo",
          unknown,
          declined,
        ]),
        select("eating_speed", "Velocidad habitual al comer", [
          "Lenta",
          "Intermedia",
          "Rápida",
          "Variable",
          unknown,
        ]),
        multi("eating_behaviors", "Experiencias que refiere la persona", [
          "Sensación de pérdida de control al comer",
          "Culpa después de comer",
          "Comer hasta sentirse incómodamente lleno/a",
          "Alimentos considerados prohibidos",
          "Saltarse comidas para compensar",
          "Otras conductas para compensar",
          "Comer a escondidas",
          "Ninguno referido",
          declined,
        ]),
        rows(
          "behavior_context_v2",
          "Explorar solo lo que la persona quiera compartir",
          [
            field("experience", "Experiencia", [
              "Pérdida de control",
              "Culpa",
              "Plenitud incómoda",
              "Alimentos prohibidos",
              "Compensación",
              "Comer a escondidas",
              "Otra",
            ]),
            field("frequency", "Frecuencia referida", [
              "Ocasional",
              "Semanal",
              "Varias veces por semana",
              "Diario",
              unknown,
              declined,
            ]),
            field("context", "Contexto", [
              "Estrés",
              "Restricción previa",
              "Hambre intensa",
              "Emociones",
              "Situación social",
              "Otro",
              declined,
            ]),
            field("impact", "Impacto / detalles que desea compartir"),
          ],
          { visibility_condition: selected("eating_behaviors") },
        ),
        select("stress_level", "Estrés percibido actualmente", [
          "Bajo",
          "Moderado",
          "Alto",
          "Variable",
          declined,
        ]),
        select(
          "behavior_support",
          "Criterio profesional: siguiente paso",
          [
            "Continuar exploración en consulta",
            "Adaptar el abordaje para evitar rigidez",
            "Considerar instrumento validado apropiado",
            "Coordinar apoyo interdisciplinario",
            "Sin necesidad identificada en este bloque",
            "Pendiente",
          ],
          {
            response_area: "professional_assessment",
            help_text:
              "No se calculan puntuaciones de riesgo ni diagnósticos a partir de estas respuestas.",
          },
        ),
      ],
    ),
    section(
      "interview_closure",
      "Síntesis de la entrevista",
      "Repasemos lo que comprendí: qué busca la persona, qué facilita el cambio y qué necesita mayor evaluación. Verifica que el resumen represente lo conversado. La valoración completa, antropometría, diagnóstico y plan se desarrollarán por separado.",
      [
        multi(
          "interview_priorities",
          "Aspectos a considerar en la siguiente etapa",
          [
            "Horarios / organización",
            "Acceso / presupuesto",
            "Preferencias / restricciones",
            "Síntomas",
            "Tratamientos por verificar",
            "Sueño",
            "Actividad",
            "Patrón de alimentación",
            "Relación con la comida",
            "Coordinación con otro profesional",
            "Otra",
          ],
          { response_area: "professional_assessment" },
        ),
        select(
          "interview_review",
          "¿Se revisó lo capturado con la persona?",
          [
            "Sí, refleja lo conversado",
            "Se aclararon y corrigieron datos",
            "Quedan datos pendientes",
          ],
          { response_area: "professional_assessment", is_required: true },
        ),
        q(
          "interview_notes",
          "Observaciones profesionales (opcional)",
          "long_text",
          { max_length: 2000 },
          {
            response_area: "professional_assessment",
            help_text:
              "Añade solo matices que no estén registrados. La síntesis se arma con las respuestas; no hace falta reescribir la entrevista.",
          },
        ),
      ],
    ),
  ],
};

export const interviewTemplateVersion = 2;
export const interviewTemplateKey = "system_initial_v2";
export const interviewTemplateName = "Entrevista nutricional inicial";
