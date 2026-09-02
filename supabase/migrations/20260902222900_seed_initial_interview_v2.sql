-- Generated from frontend/src/features/consultations/interviewTemplate.ts.
-- New template only: no personal templates, consultations or answers are changed.
do $seed$
declare structure jsonb := $interview${
  "consultation_type": "initial",
  "sections": [
    {
      "section_key": "motivo",
      "title": "Motivo y expectativas",
      "description": "Antes de hablar de alimentación, quiero entender qué te trae, qué te preocupa y qué cambio sería valioso para ti. ¿Por qué decidiste venir ahora? Primero escucha; después registra las opciones que mejor describan lo que la persona cuenta.",
      "questions": [
        {
          "question_key": "main_reason",
          "label": "Motivo principal de la consulta",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": true,
          "configuration": {
            "options": [
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
              "Otra"
            ]
          }
        },
        {
          "question_key": "main_reason_other",
          "label": "Otro motivo de consulta",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "visibility_condition": {
            "question_key": "main_reason",
            "contains": "Otra"
          }
        },
        {
          "question_key": "expectations",
          "label": "¿Qué le gustaría conseguir?",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
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
              "No sabe / no recuerda"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "expectations_other",
          "label": "Otra expectativa",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "visibility_condition": {
            "question_key": "expectations",
            "contains": "Otra"
          }
        },
        {
          "question_key": "consult_now",
          "label": "¿Qué motivó acudir ahora?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Decisión personal",
              "Recomendación médica",
              "Síntomas recientes",
              "Cambio en estudios",
              "Cambio de etapa de vida",
              "Preocupación familiar",
              "Otra",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "consult_now_other",
          "label": "Otro motivo para acudir ahora",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "visibility_condition": {
            "question_key": "consult_now",
            "contains": "Otra"
          }
        },
        {
          "question_key": "problem_onset",
          "label": "¿Desde cuándo está presente el motivo o problema?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Menos de 1 mes",
              "1–6 meses",
              "6–12 meses",
              "Más de 1 año",
              "No hay un problema; busca prevención",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "trigger_events",
          "label": "Cambios que coincidieron con el inicio",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
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
              "Ninguno referido",
              "No sabe / no recuerda"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "trigger_events_other",
          "label": "Otro cambio importante",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "visibility_condition": {
            "question_key": "trigger_events",
            "contains": "Otra"
          }
        },
        {
          "question_key": "previous_care_status",
          "label": "¿Ha intentado cambios o recibido atención nutricional antes?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Sí",
              "No",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "previous_attempts",
          "label": "Experiencias previas: conservar lo útil y evitar repetir dificultades",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "approach",
                "label": "¿Qué intentó?",
                "type": "select",
                "options": [
                  "Consulta nutricional",
                  "Plan por cuenta propia",
                  "Aplicación",
                  "Programa comercial",
                  "Restricción / ayuno",
                  "Ejercicio",
                  "Otra"
                ]
              },
              {
                "key": "result",
                "label": "¿Qué ocurrió?",
                "type": "select",
                "options": [
                  "Le ayudó y pudo mantenerlo",
                  "Le ayudó temporalmente",
                  "No notó cambios",
                  "Le resultó difícil",
                  "Le generó malestar",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "helped",
                "label": "Lo que sí le ayudó",
                "type": "select",
                "options": [
                  "Acompañamiento",
                  "Flexibilidad",
                  "Organización",
                  "Alimentos de su gusto",
                  "Apoyo familiar",
                  "Educación",
                  "Nada identificado",
                  "Otra"
                ]
              },
              {
                "key": "difficulty",
                "label": "Principal dificultad",
                "type": "select",
                "options": [
                  "Tiempo",
                  "Costo",
                  "Hambre",
                  "Restricción",
                  "Falta de apoyo",
                  "Horarios",
                  "Preparación",
                  "Ninguna",
                  "Otra"
                ]
              }
            ],
            "add_label": "Agregar registro"
          },
          "visibility_condition": {
            "question_key": "previous_care_status",
            "equals": "Sí"
          }
        },
        {
          "question_key": "opening_words",
          "label": "En sus propias palabras (opcional)",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "help_text": "Solo una frase si añade información que las opciones no capturan."
        }
      ]
    },
    {
      "section_key": "health_history",
      "title": "Antecedentes personales y familiares",
      "description": "¿Qué diagnósticos te han explicado y quién lleva su seguimiento? Separa lo diagnosticado de lo que todavía está en estudio. Después revisemos antecedentes familiares y procedimientos que puedan influir en tu alimentación.",
      "questions": [
        {
          "question_key": "history_source",
          "label": "¿Quién aporta la información?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Paciente",
              "Paciente y acompañante",
              "Madre / padre / tutor",
              "Cuidador/a",
              "Expediente / referencia",
              "Otra"
            ]
          }
        },
        {
          "question_key": "caregiver_relation",
          "label": "Nombre y parentesco del acompañante",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "visibility_condition": {
            "question_key": "history_source",
            "in": [
              "Paciente y acompañante",
              "Madre / padre / tutor",
              "Cuidador/a"
            ]
          }
        },
        {
          "question_key": "medical_history_status",
          "label": "¿Refiere diagnósticos médicos?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Sí",
              "No",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "medical_diagnoses_v2",
          "label": "Diagnósticos y seguimiento",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "condition",
                "label": "Diagnóstico",
                "type": "select",
                "options": [
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
                  "Otra"
                ],
                "required": true
              },
              {
                "key": "other_condition",
                "label": "Nombre específico / otro diagnóstico",
                "type": "text"
              },
              {
                "key": "since",
                "label": "Fecha o edad aproximada al diagnóstico",
                "type": "text"
              },
              {
                "key": "status",
                "label": "Situación",
                "type": "select",
                "options": [
                  "Diagnosticado",
                  "En estudio",
                  "Antecedente resuelto",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "treatment",
                "label": "Tratamiento actual",
                "type": "select",
                "options": [
                  "Medicamento",
                  "Alimentación / estilo de vida",
                  "Ambos",
                  "Otro",
                  "Sin tratamiento",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "physician",
                "label": "Médico o servicio que lo atiende",
                "type": "text"
              }
            ],
            "add_label": "Agregar registro"
          },
          "visibility_condition": {
            "question_key": "medical_history_status",
            "equals": "Sí"
          },
          "help_text": "Información referida; no convierte una sospecha en diagnóstico confirmado."
        },
        {
          "question_key": "procedures_status",
          "label": "¿Cirugías, hospitalizaciones o tratamientos relevantes?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Sí",
              "No",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "procedures",
          "label": "Procedimientos y hospitalizaciones",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "type",
                "label": "Tipo",
                "type": "select",
                "options": [
                  "Cirugía digestiva",
                  "Cirugía bariátrica",
                  "Otra cirugía",
                  "Hospitalización",
                  "Tratamiento prolongado",
                  "Otro"
                ]
              },
              {
                "key": "description",
                "label": "Procedimiento / motivo",
                "type": "text",
                "required": true
              },
              {
                "key": "when",
                "label": "Fecha aproximada",
                "type": "text"
              },
              {
                "key": "effects",
                "label": "Repercusiones actuales en alimentación",
                "type": "text"
              }
            ],
            "add_label": "Agregar registro"
          },
          "visibility_condition": {
            "question_key": "procedures_status",
            "equals": "Sí"
          }
        },
        {
          "question_key": "life_stage",
          "label": "Etapa o situación relevante (si corresponde)",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Ninguna particular",
              "Embarazo",
              "Lactancia",
              "Posparto",
              "Infancia / adolescencia",
              "Persona mayor",
              "Otra",
              "Prefiere no responder"
            ]
          }
        },
        {
          "question_key": "life_stage_context",
          "label": "Contexto relevante de esta etapa",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "visibility_condition": {
            "question_key": "life_stage",
            "any_except": [
              "Ninguna particular",
              "Prefiere no responder"
            ]
          },
          "help_text": "Ej. semanas de gestación o apoyo para la alimentación. No solicita medidas corporales."
        },
        {
          "question_key": "family_history_status",
          "label": "¿Conoce antecedentes familiares relevantes?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Sí",
              "No",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "family_conditions_v2",
          "label": "Antecedentes por familiar",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "relative",
                "label": "Parentesco",
                "type": "select",
                "options": [
                  "Madre",
                  "Padre",
                  "Hermano/a",
                  "Abuelo/a materno/a",
                  "Abuelo/a paterno/a",
                  "Hijo/a",
                  "Otro"
                ],
                "required": true
              },
              {
                "key": "condition",
                "label": "Enfermedad",
                "type": "select",
                "options": [
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
                  "Otra"
                ],
                "required": true
              },
              {
                "key": "age",
                "label": "Edad aproximada al inicio",
                "type": "text"
              },
              {
                "key": "details",
                "label": "Otro diagnóstico / parentesco",
                "type": "text",
                "detail": true
              }
            ],
            "add_label": "Agregar registro"
          },
          "visibility_condition": {
            "question_key": "family_history_status",
            "equals": "Sí"
          }
        }
      ]
    },
    {
      "section_key": "treatments",
      "title": "Medicamentos y suplementos",
      "description": "Incluyamos lo recetado y lo que tomas por tu cuenta: vitaminas, proteínas, creatina, hierbas, productos de farmacia y productos para cambiar el peso. Si no recuerdas un dato, podemos dejarlo pendiente de verificar; no hace falta adivinarlo.",
      "questions": [
        {
          "question_key": "medication_status",
          "label": "¿Usa medicamentos actualmente?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Sí",
              "No",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "medication_list_v2",
          "label": "Medicamentos actuales",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "name",
                "label": "Nombre del producto",
                "type": "text",
                "required": true
              },
              {
                "key": "dose",
                "label": "Dosis y unidad",
                "type": "text",
                "placeholder": "Ej. 500 mg; si no se conoce, indícalo"
              },
              {
                "key": "frequency",
                "label": "Frecuencia",
                "type": "select",
                "options": [
                  "Diario",
                  "2 veces al día",
                  "3 veces al día",
                  "Semanal",
                  "Según necesidad",
                  "Otra",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "schedule",
                "label": "Momento de toma",
                "type": "select",
                "options": [
                  "En ayunas",
                  "Con desayuno",
                  "Con comida",
                  "Con cena",
                  "Antes de dormir",
                  "Varios horarios",
                  "Otro",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "reason",
                "label": "Motivo de uso",
                "type": "text"
              },
              {
                "key": "since",
                "label": "Desde cuándo",
                "type": "select",
                "options": [
                  "Menos de 1 mes",
                  "1–6 meses",
                  "6–12 meses",
                  "Más de 1 año",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "prescriber",
                "label": "Indicado por",
                "type": "select",
                "options": [
                  "Médico/a",
                  "Nutriólogo/a",
                  "Otro profesional",
                  "Por cuenta propia",
                  "No sabe / no recuerda"
                ],
                "detail": true
              },
              {
                "key": "details",
                "label": "Dosis, horario o indicación adicional",
                "type": "text",
                "detail": true
              }
            ],
            "add_label": "Agregar medicamento"
          },
          "visibility_condition": {
            "question_key": "medication_status",
            "equals": "Sí"
          }
        },
        {
          "question_key": "supplement_types",
          "label": "Suplementos o productos utilizados",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Vitaminas / minerales",
              "Proteína",
              "Creatina",
              "Hierbas / infusiones concentradas",
              "Productos para bajar de peso",
              "Productos de venta libre",
              "Otro",
              "No utiliza",
              "No sabe / no recuerda"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "supplement_list_v2",
          "label": "Suplementos y otros productos",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "name",
                "label": "Nombre del producto",
                "type": "text",
                "required": true
              },
              {
                "key": "dose",
                "label": "Dosis y unidad",
                "type": "text",
                "placeholder": "Ej. 500 mg; si no se conoce, indícalo"
              },
              {
                "key": "frequency",
                "label": "Frecuencia",
                "type": "select",
                "options": [
                  "Diario",
                  "2 veces al día",
                  "3 veces al día",
                  "Semanal",
                  "Según necesidad",
                  "Otra",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "schedule",
                "label": "Momento de toma",
                "type": "select",
                "options": [
                  "En ayunas",
                  "Con desayuno",
                  "Con comida",
                  "Con cena",
                  "Antes de dormir",
                  "Varios horarios",
                  "Otro",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "reason",
                "label": "Motivo de uso",
                "type": "text"
              },
              {
                "key": "since",
                "label": "Desde cuándo",
                "type": "select",
                "options": [
                  "Menos de 1 mes",
                  "1–6 meses",
                  "6–12 meses",
                  "Más de 1 año",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "prescriber",
                "label": "Indicado por",
                "type": "select",
                "options": [
                  "Médico/a",
                  "Nutriólogo/a",
                  "Otro profesional",
                  "Por cuenta propia",
                  "No sabe / no recuerda"
                ],
                "detail": true
              },
              {
                "key": "details",
                "label": "Dosis, horario o indicación adicional",
                "type": "text",
                "detail": true
              }
            ],
            "add_label": "Agregar producto"
          },
          "visibility_condition": {
            "question_key": "supplement_types",
            "any_except": [
              "No utiliza",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "treatment_changes",
          "label": "¿Cambios recientes o efectos que afecten apetito / digestión?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Sin cambios ni efectos referidos",
              "Cambió medicamento / dosis",
              "Refiere efectos",
              "Cambios y efectos",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "treatment_effect_details",
          "label": "Producto y cambio o efecto referido",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "visibility_condition": {
            "question_key": "treatment_changes",
            "in": [
              "Cambió medicamento / dosis",
              "Refiere efectos",
              "Cambios y efectos"
            ]
          }
        },
        {
          "question_key": "treatment_verification",
          "label": "Información pendiente de verificar",
          "question_type": "multi_select",
          "response_area": "professional_assessment",
          "is_required": false,
          "configuration": {
            "options": [
              "Nombre",
              "Dosis",
              "Frecuencia",
              "Horario",
              "Indicación",
              "Fotografía / receta del producto",
              "Ninguna"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        }
      ]
    },
    {
      "section_key": "symptoms",
      "title": "Apetito y síntomas",
      "description": "¿Has notado molestias al comer, digerir o evacuar? Pregunta por los síntomas presentes y detalla solo los relevantes. Distingue lo que refiere la persona de lo observado; estas respuestas no generan diagnósticos automáticos.",
      "questions": [
        {
          "question_key": "appetite",
          "label": "Apetito y cambios recientes",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Sin cambios",
              "Menor apetito",
              "Mayor apetito",
              "Variable",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "digestive_screen",
          "label": "Síntomas digestivos referidos",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
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
              "Ninguno referido",
              "No sabe / no recuerda"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "bowel_frequency",
          "label": "Frecuencia habitual de evacuaciones",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Más de 3 al día",
              "1–3 al día",
              "Cada 2 días",
              "3 o menos por semana",
              "Muy variable",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "general_symptoms",
          "label": "Síntomas generales referidos",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Fatiga",
              "Debilidad",
              "Mareo",
              "Sed excesiva",
              "Orina frecuente",
              "Hinchazón / edema",
              "Ninguno referido",
              "No sabe / no recuerda"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "skin_hair_nails",
          "label": "Cambios en piel, cabello, uñas o boca",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Caída de cabello",
              "Uñas frágiles",
              "Lesiones en piel o boca",
              "Cambios en la piel",
              "Ninguno referido",
              "No sabe / no recuerda"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "symptom_details_v2",
          "label": "Caracterizar los síntomas relevantes",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "symptom",
                "label": "Síntoma",
                "type": "select",
                "options": [
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
                  "Fatiga",
                  "Debilidad",
                  "Mareo",
                  "Sed excesiva",
                  "Orina frecuente",
                  "Hinchazón / edema",
                  "Caída de cabello",
                  "Uñas frágiles",
                  "Lesiones en piel o boca",
                  "Cambios en la piel",
                  "Cambio de apetito",
                  "Otro"
                ],
                "required": true
              },
              {
                "key": "onset",
                "label": "Desde cuándo",
                "type": "select",
                "options": [
                  "Días",
                  "Semanas",
                  "Meses",
                  "Años",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "frequency",
                "label": "Frecuencia",
                "type": "select",
                "options": [
                  "Ocasional",
                  "Varias veces por semana",
                  "Diario",
                  "Con alimentos específicos",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "impact",
                "label": "Impacto referido",
                "type": "select",
                "options": [
                  "No limita",
                  "Interfiere parcialmente",
                  "Limita comer / beber / actividades",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "triggers",
                "label": "Alimentos o situaciones asociados",
                "type": "text"
              },
              {
                "key": "care",
                "label": "Atención recibida",
                "type": "select",
                "options": [
                  "Ya evaluado",
                  "En seguimiento",
                  "No evaluado",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "notes",
                "label": "Otros detalles",
                "type": "text",
                "detail": true
              }
            ],
            "add_label": "Detallar síntoma"
          },
          "visibility_condition": {
            "any": [
              {
                "question_key": "digestive_screen",
                "any_except": [
                  "Ninguno referido",
                  "No sabe / no recuerda",
                  "Prefiere no responder"
                ]
              },
              {
                "question_key": "general_symptoms",
                "any_except": [
                  "Ninguno referido",
                  "No sabe / no recuerda",
                  "Prefiere no responder"
                ]
              },
              {
                "question_key": "skin_hair_nails",
                "any_except": [
                  "Ninguno referido",
                  "No sabe / no recuerda",
                  "Prefiere no responder"
                ]
              },
              {
                "question_key": "appetite",
                "in": [
                  "Menor apetito",
                  "Mayor apetito",
                  "Variable"
                ]
              }
            ]
          }
        },
        {
          "question_key": "symptom_action",
          "label": "Criterio profesional: ¿requiere valoración adicional?",
          "question_type": "select",
          "response_area": "professional_assessment",
          "is_required": false,
          "configuration": {
            "options": [
              "No se identifica necesidad en esta entrevista",
              "Solicitar información adicional",
              "Coordinar valoración médica",
              "Valoración prioritaria según criterio clínico",
              "Pendiente de valorar"
            ]
          },
          "help_text": "La urgencia y las decisiones clínicas corresponden al profesional; no es un sistema de triaje."
        }
      ]
    },
    {
      "section_key": "sleep",
      "title": "Sueño y descanso",
      "description": "Repasemos una noche habitual: a qué hora te acuestas, cuándo despiertas y cómo te sientes durante el día. Me interesa cómo el descanso influye en tu energía, hambre, horarios y posibilidades de cambio, no etiquetar un trastorno.",
      "questions": [
        {
          "question_key": "bedtime",
          "label": "Hora habitual de acostarse",
          "question_type": "time",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {}
        },
        {
          "question_key": "waketime",
          "label": "Hora habitual de despertar",
          "question_type": "time",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {}
        },
        {
          "question_key": "sleep_hours",
          "label": "Horas reales de sueño",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Menos de 4",
              "4–5",
              "5–6",
              "6–7",
              "7–8",
              "8–9",
              "Más de 9",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "sleep_continuity",
          "label": "Continuidad del sueño",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Continuo",
              "Despertares ocasionales",
              "Despertares frecuentes",
              "Dificultad para conciliarlo",
              "Horario muy variable",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "sleep_rested",
          "label": "¿Despierta descansado/a?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Casi siempre",
              "A veces",
              "Casi nunca",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "sleep_signals",
          "label": "Situaciones referidas durante el sueño",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Ronquidos",
              "Pausas respiratorias comentadas por otra persona",
              "Somnolencia diurna",
              "Despertar para comer",
              "Ninguno referido",
              "No sabe / no recuerda"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "night_shifts",
          "label": "¿Trabaja turnos nocturnos o rotatorios?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "No",
              "Nocturnos",
              "Rotatorios",
              "Ocasionales"
            ]
          }
        },
        {
          "question_key": "sleep_impact",
          "label": "¿En qué influye el descanso?",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Energía",
              "Hambre / antojos",
              "Horarios para comer",
              "Entrenamiento",
              "Concentración",
              "Ninguna",
              "No sabe / no recuerda"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        }
      ]
    },
    {
      "section_key": "activity",
      "title": "Movimiento y ejercicio",
      "description": "Diferenciemos tu movimiento diario del ejercicio planeado. ¿Cómo transcurre tu jornada y cómo te trasladas? Si entrenas, revisemos tipo, frecuencia, duración e intensidad. Consideremos lesiones o limitaciones antes de plantear cambios.",
      "questions": [
        {
          "question_key": "daily_activity",
          "label": "Actividad cotidiana predominante",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Principalmente sentado/a",
              "Alterna sentado/a y de pie",
              "Principalmente de pie",
              "Trabajo físico",
              "Variable",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "sitting_time",
          "label": "Tiempo sentado al día",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Menos de 2 horas",
              "2–4 horas",
              "4–6 horas",
              "6–8 horas",
              "Más de 8 horas",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "transport",
          "label": "Traslados habituales",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Caminando",
              "Bicicleta",
              "Transporte público",
              "Automóvil / motocicleta",
              "No realiza traslados",
              "Otro"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "known_steps",
          "label": "Pasos diarios, si los conoce (opcional)",
          "question_type": "number",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "min": 0,
            "max": 100000,
            "step": 1
          }
        },
        {
          "question_key": "exercise_status",
          "label": "¿Realiza ejercicio planeado?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Sí",
              "No",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "exercise_sessions",
          "label": "Rutina de ejercicio",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "type",
                "label": "Tipo",
                "type": "select",
                "options": [
                  "Caminata",
                  "Carrera",
                  "Bicicleta",
                  "Natación",
                  "Fuerza / pesas",
                  "Deporte de equipo",
                  "Baile",
                  "Movilidad / yoga",
                  "Otro"
                ],
                "required": true
              },
              {
                "key": "days",
                "label": "Días por semana",
                "type": "select",
                "options": [
                  "1",
                  "2",
                  "3",
                  "4",
                  "5",
                  "6",
                  "7"
                ]
              },
              {
                "key": "minutes",
                "label": "Minutos por sesión",
                "type": "number",
                "min": 1,
                "max": 1440
              },
              {
                "key": "intensity",
                "label": "Intensidad percibida",
                "type": "select",
                "options": [
                  "Ligera",
                  "Moderada",
                  "Vigorosa",
                  "Variable",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "time",
                "label": "Horario",
                "type": "select",
                "options": [
                  "Mañana",
                  "Mediodía",
                  "Tarde",
                  "Noche",
                  "Variable"
                ]
              },
              {
                "key": "experience",
                "label": "Desde cuándo",
                "type": "select",
                "options": [
                  "Menos de 1 mes",
                  "1–6 meses",
                  "6–12 meses",
                  "Más de 1 año",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "goal",
                "label": "Objetivo",
                "type": "select",
                "options": [
                  "Salud",
                  "Disfrute",
                  "Fuerza",
                  "Rendimiento / competencia",
                  "Composición corporal",
                  "Rehabilitación",
                  "Otro"
                ]
              },
              {
                "key": "details",
                "label": "Otro tipo / detalles",
                "type": "text",
                "detail": true
              }
            ],
            "add_label": "Agregar actividad"
          },
          "visibility_condition": {
            "question_key": "exercise_status",
            "equals": "Sí"
          }
        },
        {
          "question_key": "strength_training",
          "label": "¿Incluye entrenamiento de fuerza?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Sí",
              "No",
              "No sabe / no recuerda"
            ]
          },
          "visibility_condition": {
            "question_key": "exercise_status",
            "equals": "Sí"
          },
          "help_text": "Si responde sí, registra también días y duración como actividad de fuerza arriba."
        },
        {
          "question_key": "activity_limitations",
          "label": "Limitaciones para moverse o entrenar",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Dolor",
              "Lesión",
              "Condición médica",
              "Discapacidad / movilidad reducida",
              "Falta de tiempo",
              "Falta de acceso",
              "Temor / inseguridad",
              "Ninguno referido",
              "Prefiere no responder"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "activity_limit_details",
          "label": "Limitación, cuidados o indicaciones relevantes",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "visibility_condition": {
            "question_key": "activity_limitations",
            "any_except": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder"
            ]
          }
        }
      ]
    },
    {
      "section_key": "substances",
      "title": "Alcohol, tabaco y otras sustancias",
      "description": "Estas preguntas ayudan a entender tu rutina y se hacen sin juicios. No basta con saber si consumes algo: importa qué, cuánto y con qué frecuencia. Puedes indicar que prefieres no responder.",
      "questions": [
        {
          "question_key": "alcohol_status",
          "label": "Consumo de alcohol",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "No consume",
              "Consumió antes",
              "Consume actualmente",
              "Prefiere no responder"
            ]
          }
        },
        {
          "question_key": "alcohol_pattern",
          "label": "Patrón de consumo de alcohol",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "type",
                "label": "Bebida",
                "type": "select",
                "options": [
                  "Cerveza",
                  "Vino",
                  "Destilados",
                  "Cócteles",
                  "Otra"
                ]
              },
              {
                "key": "amount",
                "label": "Cantidad por ocasión",
                "type": "text",
                "placeholder": "Ej. 2 botellas de 355 mL"
              },
              {
                "key": "frequency",
                "label": "Frecuencia",
                "type": "select",
                "options": [
                  "Menos de una vez al mes",
                  "1–3 veces al mes",
                  "1–2 días por semana",
                  "3–4 días por semana",
                  "5–7 días por semana",
                  "No sabe / no recuerda"
                ]
              }
            ],
            "add_label": "Agregar registro"
          },
          "visibility_condition": {
            "question_key": "alcohol_status",
            "equals": "Consume actualmente"
          },
          "help_text": "Conservar cantidad y tamaño de la bebida; no convertir automáticamente a unidades estándar."
        },
        {
          "question_key": "alcohol_high_episodes",
          "label": "¿Ocasiones en que consume mucho más de lo habitual?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "No",
              "Ocasionalmente",
              "Frecuentemente",
              "No sabe / no recuerda",
              "Prefiere no responder"
            ]
          },
          "visibility_condition": {
            "question_key": "alcohol_status",
            "equals": "Consume actualmente"
          }
        },
        {
          "question_key": "alcohol_high_details",
          "label": "Cantidad y frecuencia de esas ocasiones",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "visibility_condition": {
            "question_key": "alcohol_high_episodes",
            "in": [
              "Ocasionalmente",
              "Frecuentemente"
            ]
          }
        },
        {
          "question_key": "tobacco_status",
          "label": "Tabaco o nicotina",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "No consume",
              "Consumió antes",
              "Consume actualmente",
              "Prefiere no responder"
            ]
          }
        },
        {
          "question_key": "tobacco_pattern",
          "label": "Producto, cantidad y frecuencia",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "type",
                "label": "Producto",
                "type": "select",
                "options": [
                  "Cigarrillos",
                  "Vapeador",
                  "Tabaco calentado",
                  "Otro"
                ]
              },
              {
                "key": "amount",
                "label": "Cantidad aproximada",
                "type": "text"
              },
              {
                "key": "frequency",
                "label": "Frecuencia",
                "type": "select",
                "options": [
                  "Diario",
                  "Algunos días",
                  "Ocasional",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "since",
                "label": "Desde cuándo",
                "type": "text"
              }
            ],
            "add_label": "Agregar registro"
          },
          "visibility_condition": {
            "question_key": "tobacco_status",
            "equals": "Consume actualmente"
          }
        },
        {
          "question_key": "other_substances_status",
          "label": "¿Otras sustancias que considere relevante comentar?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Sí",
              "No",
              "No sabe / no recuerda",
              "Prefiere no responder"
            ]
          }
        },
        {
          "question_key": "other_substances",
          "label": "Información referida sobre otras sustancias",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "name",
                "label": "Sustancia",
                "type": "text"
              },
              {
                "key": "amount",
                "label": "Cantidad",
                "type": "text"
              },
              {
                "key": "frequency",
                "label": "Frecuencia",
                "type": "text"
              },
              {
                "key": "context",
                "label": "Contexto / efecto en alimentación",
                "type": "text"
              }
            ],
            "add_label": "Agregar registro"
          },
          "visibility_condition": {
            "question_key": "other_substances_status",
            "equals": "Sí"
          }
        }
      ]
    },
    {
      "section_key": "recall",
      "title": "Recordatorio de 24 horas",
      "description": "Primero escucha todo lo que comió y bebió desde que despertó hasta que se durmió, sin interrumpir. Después busca olvidos, completa horarios y cantidades, y revisa al final. Es un día concreto: no lo confundas con el consumo habitual ni calcules nutrientes sin una fuente de composición.",
      "questions": [
        {
          "question_key": "recall_date",
          "label": "Día al que corresponde el recordatorio",
          "question_type": "date",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {}
        },
        {
          "question_key": "recall_day_type",
          "label": "¿Cómo fue ese día?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Habitual entre semana",
              "Habitual de fin de semana",
              "Diferente por trabajo / viaje",
              "Enfermedad / poco apetito",
              "Celebración / evento",
              "Otro",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "recall_24h_v2",
          "label": "1. Lista rápida · 3. Horarios · 4. Detalles",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "food",
                "label": "Alimento o bebida",
                "type": "text",
                "required": true,
                "placeholder": "Anota primero lo que recuerda"
              },
              {
                "key": "occasion",
                "label": "Ocasión",
                "type": "select",
                "options": [
                  "Desayuno",
                  "Colación matutina",
                  "Comida",
                  "Colación vespertina",
                  "Cena",
                  "Consumo nocturno",
                  "Otro"
                ]
              },
              {
                "key": "time",
                "label": "Hora",
                "type": "time"
              },
              {
                "key": "amount",
                "label": "Cantidad y tamaño",
                "type": "text",
                "placeholder": "Ej. 1 taza, 2 tortillas, 1 pieza mediana"
              },
              {
                "key": "preparation",
                "label": "Preparación",
                "type": "select",
                "options": [
                  "Crudo",
                  "Hervido / vapor",
                  "Asado / plancha",
                  "Horneado",
                  "Frito",
                  "Guisado",
                  "Envasado",
                  "Otra",
                  "No sabe / no recuerda"
                ],
                "detail": true
              },
              {
                "key": "brand",
                "label": "Marca (si aplica)",
                "type": "text",
                "detail": true
              },
              {
                "key": "ingredients",
                "label": "Ingredientes / aceite / azúcar",
                "type": "text",
                "detail": true
              },
              {
                "key": "accompaniments",
                "label": "Salsas y acompañamientos",
                "type": "text",
                "detail": true
              },
              {
                "key": "place",
                "label": "Lugar",
                "type": "select",
                "options": [
                  "Casa",
                  "Trabajo / escuela",
                  "Restaurante",
                  "Comedor",
                  "Calle",
                  "En traslado",
                  "Otro"
                ],
                "detail": true
              }
            ],
            "add_label": "Agregar alimento o bebida"
          },
          "help_text": "Un registro por alimento o preparación. “Completar detalles” permite hacer la segunda pasada sin perder la lista rápida."
        },
        {
          "question_key": "recall_forgotten_review",
          "label": "2. Buscar olvidos: categorías que ya se preguntaron",
          "question_type": "multi_select",
          "response_area": "professional_assessment",
          "is_required": false,
          "configuration": {
            "options": [
              "Bebidas / agua",
              "Snacks / dulces",
              "Salsas / aderezos",
              "Aceites / grasas",
              "Alcohol",
              "Café / té",
              "Leche / azúcar añadida",
              "Probaditas al cocinar"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          },
          "help_text": "Marcar significa que se revisó, no que lo consumió. Si recuerda algo, agrégalo en la lista."
        },
        {
          "question_key": "recall_final_check",
          "label": "5. ¿Falta algo por anotar de lo que comió o bebió?",
          "question_type": "select",
          "response_area": "professional_assessment",
          "is_required": false,
          "configuration": {
            "options": [
              "Revisado; no recuerda más",
              "Agregó alimentos y se revisó de nuevo",
              "Pendiente de completar"
            ]
          }
        }
      ]
    },
    {
      "section_key": "habitual",
      "title": "Alimentación habitual e hidratación",
      "description": "Ahora salgamos de ese día y pensemos en las últimas semanas. ¿Qué comidas se repiten y qué cambia el fin de semana? La frecuencia indica cuántos días suele consumir un grupo; no equivale a porciones ni a una evaluación automática de la calidad de la dieta.",
      "questions": [
        {
          "question_key": "usual_pattern",
          "label": "Tiempos de comida que acostumbra realizar",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Desayuno",
              "Colación matutina",
              "Comida",
              "Colación vespertina",
              "Cena",
              "Consumo nocturno",
              "Variable / sin patrón"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "usual_meals",
          "label": "Horarios y opciones habituales",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "occasion",
                "label": "Tiempo de comida",
                "type": "select",
                "options": [
                  "Desayuno",
                  "Colación matutina",
                  "Comida",
                  "Colación vespertina",
                  "Cena",
                  "Consumo nocturno",
                  "Otro"
                ],
                "required": true
              },
              {
                "key": "time",
                "label": "Hora aproximada",
                "type": "time"
              },
              {
                "key": "frequency",
                "label": "Frecuencia",
                "type": "select",
                "options": [
                  "Nunca",
                  "Menos de 1 vez por semana",
                  "1–2 días por semana",
                  "3–4 días por semana",
                  "5–6 días por semana",
                  "Diario",
                  "No sabe / no recuerda"
                ]
              },
              {
                "key": "foods",
                "label": "Opciones que se repiten",
                "type": "text"
              },
              {
                "key": "weekend",
                "label": "Cambio en fin de semana",
                "type": "select",
                "options": [
                  "Sin cambio",
                  "Más tarde",
                  "Más temprano",
                  "Omite este tiempo",
                  "Come fuera",
                  "Variable"
                ]
              }
            ],
            "add_label": "Agregar tiempo de comida"
          }
        },
        {
          "question_key": "food_frequency_v2",
          "label": "Frecuencia habitual por grupo",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "widget": "frequency_grid",
            "items": [
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
              "Agua simple"
            ],
            "options": [
              "Nunca",
              "Menos de 1 vez por semana",
              "1–2 días por semana",
              "3–4 días por semana",
              "5–6 días por semana",
              "Diario",
              "No sabe / no recuerda"
            ]
          },
          "help_text": "Cada grupo tiene su propia frecuencia. Deja sin responder lo que todavía no se haya explorado."
        },
        {
          "question_key": "daily_drinks",
          "label": "Cantidad habitual de líquidos",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "drink",
                "label": "Bebida",
                "type": "select",
                "options": [
                  "Agua simple",
                  "Refresco",
                  "Jugo",
                  "Agua endulzada",
                  "Café",
                  "Té",
                  "Leche",
                  "Bebida energética",
                  "Otra"
                ],
                "required": true
              },
              {
                "key": "quantity",
                "label": "Cantidad al día",
                "type": "number",
                "min": 0,
                "max": 100000
              },
              {
                "key": "unit",
                "label": "Unidad",
                "type": "select",
                "options": [
                  "mL",
                  "L",
                  "Vasos",
                  "Tazas",
                  "Botellas",
                  "Latas"
                ]
              },
              {
                "key": "size",
                "label": "Tamaño del recipiente (si se conoce)",
                "type": "text"
              },
              {
                "key": "sugar",
                "label": "Azúcar / endulzante",
                "type": "select",
                "options": [
                  "Sin añadir",
                  "Azúcar",
                  "Edulcorante",
                  "Producto ya endulzado",
                  "No sabe / no recuerda"
                ]
              }
            ],
            "add_label": "Agregar bebida"
          },
          "help_text": "No se presupone que todos los vasos o botellas tengan el mismo volumen."
        }
      ]
    },
    {
      "section_key": "routine",
      "title": "Horarios y posibilidades reales",
      "description": "Diseñemos alrededor de tu día real. ¿Cuándo puedes comer, cuánto tiempo tienes y dónde? Revisemos trabajo, estudio, cuidados y días distintos. Esta información permite proponer acuerdos que sí quepan en tu rutina.",
      "questions": [
        {
          "question_key": "occupation_context",
          "label": "Actividad principal",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Trabajo con horario fijo",
              "Trabajo con horario variable",
              "Estudio",
              "Trabajo y estudio",
              "Cuidados / hogar",
              "Jubilación",
              "Otra",
              "Prefiere no responder"
            ]
          }
        },
        {
          "question_key": "leave_home",
          "label": "Hora habitual de salir de casa (si aplica)",
          "question_type": "time",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {}
        },
        {
          "question_key": "daily_schedule",
          "label": "Jornada y ventanas reales para comer",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "day",
                "label": "Día / tipo de jornada",
                "type": "select",
                "options": [
                  "Entre semana",
                  "Fin de semana",
                  "Turno matutino",
                  "Turno vespertino",
                  "Turno nocturno",
                  "Día variable",
                  "Otro"
                ]
              },
              {
                "key": "start",
                "label": "Inicio de trabajo / estudio",
                "type": "time"
              },
              {
                "key": "end",
                "label": "Fin de trabajo / estudio",
                "type": "time"
              },
              {
                "key": "meal_window",
                "label": "Horario o ventana disponible para comer",
                "type": "text"
              },
              {
                "key": "minutes",
                "label": "Tiempo disponible",
                "type": "select",
                "options": [
                  "Menos de 10 minutos",
                  "10–20 minutos",
                  "20–30 minutos",
                  "Más de 30 minutos",
                  "Variable"
                ]
              },
              {
                "key": "place",
                "label": "Lugar habitual",
                "type": "select",
                "options": [
                  "Casa",
                  "Trabajo / escuela",
                  "Restaurante",
                  "Comedor",
                  "Calle",
                  "En traslado",
                  "Otro"
                ]
              }
            ],
            "add_label": "Agregar jornada"
          }
        },
        {
          "question_key": "food_equipment",
          "label": "Recursos disponibles fuera de casa",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Refrigerador",
              "Microondas / forma de calentar",
              "Agua potable",
              "Lugar para guardar alimentos",
              "Comedor",
              "No come fuera de casa",
              "Ninguna",
              "No sabe / no recuerda"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "food_preparer",
          "label": "¿Quién prepara los alimentos?",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Paciente",
              "Pareja",
              "Familia",
              "Cuidador/a",
              "Comedor / restaurante",
              "Compra alimentos preparados",
              "Otra"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "food_preparer_other",
          "label": "¿Quién más prepara los alimentos?",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "visibility_condition": {
            "question_key": "food_preparer",
            "contains": "Otra"
          }
        },
        {
          "question_key": "cooking_time",
          "label": "Tiempo disponible para preparar",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Menos de 15 minutos",
              "15–30 minutos",
              "30–60 minutos",
              "Más de 1 hora",
              "Puede cocinar por lotes",
              "No puede cocinar",
              "Variable"
            ]
          }
        },
        {
          "question_key": "schedule_constraints",
          "label": "Barreras de la rutina",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Horarios de trabajo",
              "Traslados",
              "Cuidados de otras personas",
              "Turnos nocturnos",
              "Viajes",
              "Tiempo corto para comer",
              "Horarios cambiantes",
              "Eventos sociales",
              "Ninguna",
              "Otra"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "schedule_constraints_other",
          "label": "Otra barrera de horarios",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "visibility_condition": {
            "question_key": "schedule_constraints",
            "contains": "Otra"
          }
        }
      ]
    },
    {
      "section_key": "preferences",
      "title": "Preferencias, alergias y restricciones",
      "description": "¿Qué alimentos disfrutas, cuáles evitas y cuáles quisieras conservar? Separa una alergia confirmada de una intolerancia diagnosticada o una molestia percibida. Las preferencias culturales o religiosas solo se registran si la persona desea compartirlas.",
      "questions": [
        {
          "question_key": "eating_preferences",
          "label": "Patrón y preferencias",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Omnívoro",
              "Vegetariano",
              "Vegano",
              "Pescetariano",
              "Flexitariano",
              "Preferencia cultural / regional",
              "Restricción religiosa",
              "Otra",
              "Prefiere no responder"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "food_preferences",
          "label": "Alimentos que debemos tomar en cuenta",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "category",
                "label": "Categoría",
                "type": "select",
                "options": [
                  "Favorito",
                  "No le gusta",
                  "No consume",
                  "No quiere dejar",
                  "Preferencia cultural / religiosa"
                ],
                "required": true
              },
              {
                "key": "food",
                "label": "Alimento o preparación",
                "type": "text",
                "required": true
              },
              {
                "key": "reason",
                "label": "Motivo, si desea comentarlo",
                "type": "text"
              }
            ],
            "add_label": "Agregar preferencia"
          }
        },
        {
          "question_key": "food_reactions_status",
          "label": "¿Alergias, intolerancias o reacciones a alimentos?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Sí",
              "No",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "food_reactions_v2",
          "label": "Reacciones: distinguir confirmación y percepción",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "food",
                "label": "Alimento / ingrediente",
                "type": "text",
                "required": true
              },
              {
                "key": "classification",
                "label": "Tipo de antecedente",
                "type": "select",
                "options": [
                  "Alergia confirmada",
                  "Sospecha de alergia",
                  "Intolerancia diagnosticada",
                  "Intolerancia percibida",
                  "Otra reacción"
                ],
                "required": true
              },
              {
                "key": "reaction",
                "label": "Reacción referida",
                "type": "text"
              },
              {
                "key": "confirmed_by",
                "label": "Quién confirmó / cómo se evaluó",
                "type": "text"
              },
              {
                "key": "management",
                "label": "Manejo actual",
                "type": "select",
                "options": [
                  "Evita el alimento",
                  "Limita cantidad",
                  "Usa sustituto",
                  "Indicación médica",
                  "Sin manejo",
                  "Otro"
                ]
              },
              {
                "key": "details",
                "label": "Detalles relevantes",
                "type": "text",
                "detail": true
              }
            ],
            "add_label": "Agregar registro"
          },
          "visibility_condition": {
            "question_key": "food_reactions_status",
            "equals": "Sí"
          }
        }
      ]
    },
    {
      "section_key": "access",
      "title": "Compra, presupuesto y apoyo",
      "description": "Antes de proponer alimentos, quiero saber qué es accesible para ti y qué presupuesto debemos respetar. Puedes no responder lo que no desees. Estas preguntas describen el contexto; no son una escala validada de inseguridad alimentaria.",
      "questions": [
        {
          "question_key": "food_buyer",
          "label": "¿Quién compra los alimentos?",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Paciente",
              "Pareja",
              "Familia",
              "Cuidador/a",
              "Otra"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "shopping_places",
          "label": "¿Dónde suelen comprar?",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Mercado / tianguis",
              "Supermercado",
              "Tienda de barrio",
              "Compra en línea",
              "Productor local",
              "Apoyo alimentario",
              "Otra"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "budget_constraint",
          "label": "¿El presupuesto limita las opciones?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "No habitualmente",
              "A veces",
              "Con frecuencia",
              "No sabe / no recuerda",
              "Prefiere no responder"
            ]
          }
        },
        {
          "question_key": "food_budget",
          "label": "Presupuesto a respetar (opcional)",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          },
          "help_text": "Si la persona lo desea: monto, moneda, periodo y para cuántas personas."
        },
        {
          "question_key": "access_barriers",
          "label": "Dificultades para conseguir o preparar alimentos",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Costo",
              "Distancia / transporte",
              "Disponibilidad regional",
              "Tiempo para comprar",
              "Falta de refrigeración",
              "Equipo para cocinar",
              "Agua potable",
              "Movilidad",
              "Sin dificultades",
              "Prefiere no responder"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "unavailable_foods",
          "label": "Alimentos que no están disponibles (opcional)",
          "question_type": "short_text",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "max_length": 300
          }
        },
        {
          "question_key": "food_shortage",
          "label": "¿Hay momentos en que faltan alimentos por recursos?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "No refiere",
              "Ocasionalmente",
              "Frecuentemente",
              "No sabe / no recuerda",
              "Prefiere no responder"
            ]
          }
        },
        {
          "question_key": "support_network",
          "label": "Apoyos disponibles para hacer cambios",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Familia",
              "Pareja",
              "Amistades",
              "Compañeros",
              "Cuidador/a",
              "Recursos comunitarios",
              "Ninguno referido",
              "Prefiere no responder"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        }
      ]
    },
    {
      "section_key": "eating_behavior",
      "title": "Relación con la comida",
      "description": "Hablemos de cómo te sientes al comer, sin juzgar. ¿Puedes reconocer hambre y saciedad? ¿Influyen el estrés o las emociones? Si surgen dificultades, explóralas con cuidado y considera apoyo interdisciplinario. Este bloque no diagnostica un trastorno de la conducta alimentaria ni sustituye un instrumento validado.",
      "questions": [
        {
          "question_key": "food_relationship",
          "label": "¿Cómo describe su relación con la comida?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Tranquila / flexible",
              "Con preocupación",
              "Con reglas rígidas",
              "Variable",
              "Le cuesta describirla",
              "Prefiere no responder"
            ]
          }
        },
        {
          "question_key": "eating_drivers",
          "label": "Situaciones que influyen al comer",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Hambre",
              "Estrés",
              "Ansiedad",
              "Aburrimiento",
              "Tristeza",
              "Celebración",
              "Disponibilidad de comida",
              "Presión social",
              "Otra",
              "Prefiere no responder"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "hunger_recognition",
          "label": "¿Reconoce señales de hambre?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Habitualmente",
              "A veces",
              "Le cuesta reconocerlas",
              "No sabe / no recuerda",
              "Prefiere no responder"
            ]
          }
        },
        {
          "question_key": "satiety_recognition",
          "label": "¿Reconoce cuándo está satisfecho/a?",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Habitualmente",
              "A veces",
              "Le cuesta reconocerlo",
              "No sabe / no recuerda",
              "Prefiere no responder"
            ]
          }
        },
        {
          "question_key": "eating_speed",
          "label": "Velocidad habitual al comer",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Lenta",
              "Intermedia",
              "Rápida",
              "Variable",
              "No sabe / no recuerda"
            ]
          }
        },
        {
          "question_key": "eating_behaviors",
          "label": "Experiencias que refiere la persona",
          "question_type": "multi_select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Sensación de pérdida de control al comer",
              "Culpa después de comer",
              "Comer hasta sentirse incómodamente lleno/a",
              "Alimentos considerados prohibidos",
              "Saltarse comidas para compensar",
              "Otras conductas para compensar",
              "Comer a escondidas",
              "Ninguno referido",
              "Prefiere no responder"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "behavior_context_v2",
          "label": "Explorar solo lo que la persona quiera compartir",
          "question_type": "repeatable_group",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "fields": [
              {
                "key": "experience",
                "label": "Experiencia",
                "type": "select",
                "options": [
                  "Pérdida de control",
                  "Culpa",
                  "Plenitud incómoda",
                  "Alimentos prohibidos",
                  "Compensación",
                  "Comer a escondidas",
                  "Otra"
                ]
              },
              {
                "key": "frequency",
                "label": "Frecuencia referida",
                "type": "select",
                "options": [
                  "Ocasional",
                  "Semanal",
                  "Varias veces por semana",
                  "Diario",
                  "No sabe / no recuerda",
                  "Prefiere no responder"
                ]
              },
              {
                "key": "context",
                "label": "Contexto",
                "type": "select",
                "options": [
                  "Estrés",
                  "Restricción previa",
                  "Hambre intensa",
                  "Emociones",
                  "Situación social",
                  "Otro",
                  "Prefiere no responder"
                ]
              },
              {
                "key": "impact",
                "label": "Impacto / detalles que desea compartir",
                "type": "text"
              }
            ],
            "add_label": "Agregar registro"
          },
          "visibility_condition": {
            "question_key": "eating_behaviors",
            "any_except": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder"
            ]
          }
        },
        {
          "question_key": "stress_level",
          "label": "Estrés percibido actualmente",
          "question_type": "select",
          "response_area": "patient_reported",
          "is_required": false,
          "configuration": {
            "options": [
              "Bajo",
              "Moderado",
              "Alto",
              "Variable",
              "Prefiere no responder"
            ]
          }
        },
        {
          "question_key": "behavior_support",
          "label": "Criterio profesional: siguiente paso",
          "question_type": "select",
          "response_area": "professional_assessment",
          "is_required": false,
          "configuration": {
            "options": [
              "Continuar exploración en consulta",
              "Adaptar el abordaje para evitar rigidez",
              "Considerar instrumento validado apropiado",
              "Coordinar apoyo interdisciplinario",
              "Sin necesidad identificada en este bloque",
              "Pendiente"
            ]
          },
          "help_text": "No se calculan puntuaciones de riesgo ni diagnósticos a partir de estas respuestas."
        }
      ]
    },
    {
      "section_key": "interview_closure",
      "title": "Síntesis de la entrevista",
      "description": "Repasemos lo que comprendí: qué busca la persona, qué facilita el cambio y qué necesita mayor evaluación. Verifica que el resumen represente lo conversado. La valoración completa, antropometría, diagnóstico y plan se desarrollarán por separado.",
      "questions": [
        {
          "question_key": "interview_priorities",
          "label": "Aspectos a considerar en la siguiente etapa",
          "question_type": "multi_select",
          "response_area": "professional_assessment",
          "is_required": false,
          "configuration": {
            "options": [
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
              "Otra"
            ],
            "exclusive_options": [
              "Ninguno referido",
              "No sabe / no recuerda",
              "Prefiere no responder",
              "Ninguna",
              "No utiliza",
              "Sin dificultades"
            ]
          }
        },
        {
          "question_key": "interview_review",
          "label": "¿Se revisó lo capturado con la persona?",
          "question_type": "select",
          "response_area": "professional_assessment",
          "is_required": true,
          "configuration": {
            "options": [
              "Sí, refleja lo conversado",
              "Se aclararon y corrigieron datos",
              "Quedan datos pendientes"
            ]
          }
        },
        {
          "question_key": "interview_notes",
          "label": "Observaciones profesionales (opcional)",
          "question_type": "long_text",
          "response_area": "professional_assessment",
          "is_required": false,
          "configuration": {
            "max_length": 2000
          },
          "help_text": "Añade solo matices que no estén registrados. La síntesis se arma con las respuestas; no hace falta reescribir la entrevista."
        }
      ]
    }
  ]
}$interview$::jsonb;
  template_id uuid; section_id uuid; section_item jsonb; question_item jsonb;
  section_order integer := 0; question_order integer;
begin
  insert into public.consultation_templates (template_key, name, consultation_type, version, is_system, is_active)
    values ('system_initial_v2', 'Entrevista nutricional inicial', 'initial', 2, true, true)
    returning id into template_id;
  for section_item in select * from jsonb_array_elements(structure->'sections') loop
    insert into public.consultation_template_sections (template_id, section_key, title, description, display_order)
      values (template_id, section_item->>'section_key', section_item->>'title', section_item->>'description', section_order)
      returning id into section_id;
    question_order := 0;
    for question_item in select * from jsonb_array_elements(section_item->'questions') loop
      insert into public.consultation_template_questions (section_id, question_key, label, help_text, question_type, response_area, is_required, display_order, configuration, visibility_condition)
        values (section_id, question_item->>'question_key', question_item->>'label', question_item->>'help_text', question_item->>'question_type',
          question_item->>'response_area', (question_item->>'is_required')::boolean, question_order,
          question_item->'configuration', question_item->'visibility_condition');
      question_order := question_order + 1;
    end loop;
    section_order := section_order + 1;
  end loop;
  update public.consultation_templates set is_active = false where template_key = 'system_initial_v1' and is_system;
end;
$seed$;
