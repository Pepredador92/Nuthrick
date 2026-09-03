# Antropometría y documentación de la consulta

## Uso

En una consulta abierta: **Antropometría y valoración**. Registrar mediciones y contexto; identificar protocolo/equipos si se desea comparar; elegir fórmulas y calcular. Las preguntas de valoración son opcionales. “Crear nota antropométrica” prepara texto local editable: no lo guarda. Se exige revisión explícita; cambiar los datos o editar la nota invalida la revisión. Un cambio en mediciones también limpia la evidencia numérica seleccionada para evitar arrastrar resultados obsoletos.

El diagnóstico es opcional, manual y separado de los resultados. PES exige problema, etiología y evidencia introducidos/seleccionados por el profesional; el modo narrativo exige texto profesional. No se generan problemas, etiologías ni recomendaciones terapéuticas.

Guardar explícitamente desde el módulo o el encabezado. El cuestionario conserva su autoguardado; la nota no se autoguarda. Cerrar una consulta o salir por un enlace interno intenta guardar los cambios revisados y detiene la acción si falla. Al refrescar con cambios pendientes se muestra la advertencia del navegador. “Descartar cambios sin guardar” restaura la última revisión sin eliminar historia.

Historial → Medidas: resultados por método. Historial → Consultas: resultados, valoración, nota y diagnóstico. Las mediciones antiguas del módulo simple siguen visibles, pero no se convierten retrospectivamente en comparaciones si carecen de protocolo/equipo.

## Alcance y fuentes

- IMC: peso kg / talla m² (entrada talla cm). Clasificación adulta de [OMS TRS 894 (2000)](https://iris.who.int/handle/10665/42330), sólo cuando edad >=18 y contexto adulto no gestante confirmado. No es un diagnóstico ni medida de grasa/músculo.
- ICC: cintura/cadera, ambas cm; resultado sin categoría universal. Orientación de [OMS (2011)](https://www.who.int/publications/i/item/9789241501491).
- Jackson-Pollock 7: siete pliegues en mm, edad y sexo requerido por la ecuación seleccionados explícitamente. [Hombres (1978)](https://pubmed.ncbi.nlm.nih.gov/718832/), edades 18–61; [mujeres (1980)](https://pubmed.ncbi.nlm.nih.gov/7402053/), edades 18–55. Estos límites no garantizan representatividad individual; confirmar técnica y pertinencia poblacional.
- Conversiones separadas: [Siri, revisado por NRC](https://www.ncbi.nlm.nih.gov/books/NBK218181/), 495/D−450; [Brozek et al. (1963)](https://pubmed.ncbi.nlm.nih.gov/14062375/), 457/D−414.2. Sin clasificaciones automáticas de grasa.
- BIA: transcripción del porcentaje del dispositivo, no ejecución de algoritmos propietarios. Fabricante/modelo/identificador, modo/software/protocolo y condiciones quedan registrados.
- Masa grasa y masa libre de grasa: derivadas de peso y cada porcentaje por separado. Masa libre de grasa **no equivale a masa muscular**.
- Somatotipo no implementado: el ejemplo de la propuesta no se trata como una fórmula validada disponible.

Las fichas guardan fuentes y versión. El catálogo y el motor de clasificación viven fuera del componente visual. Las ecuaciones se verifican con casos deterministas; estas pruebas de software no sustituyen validación clínica o revisión profesional.

## Versionado y comparación

El documento persistido contiene entradas, resultados sin redondear, unidades, procedencia, método/versión, expresión de cálculo, clasificación, reference_id/reference_version, fuentes, comparación usada, valoración, nota revisada y diagnóstico/evidencia. La visualización histórica utiliza el documento guardado y no recalcula con el catálogo actual.

Se compara el registro anterior compatible más reciente usando la última revisión de cada consulta: misma variable, unidad, método, versión y protocolo; escala para peso/IMC, plicómetro para pliegues, equipo y modo/protocolo para BIA. Nunca cruza Siri/Brozek/BIA. Los porcentajes cambian en puntos porcentuales, no en porcentaje relativo. Las diferencias de condiciones BIA se señalan sin cuantificar su efecto. Sin identidad suficiente de método/protocolo/equipo no se calcula evolución.

## Persistencia y permisos

Tabla consultation_anthropometry: professional_id, patient_id, consultation_id, revisión correlativa, fecha de medición, payload y fecha de creación. RLS restringe lectura/inserción al propietario. Un trigger SECURITY INVOKER verifica correspondencia exacta paciente/consulta/profesional, estado borrador y revisión esperada, y bloquea la consulta durante el guardado. No hay permisos UPDATE/DELETE para authenticated; una revisión nueva no reemplaza la anterior. El borrado autorizado de consulta/paciente mantiene las cascadas existentes.

show_formula_guidance inicia true. Se puede desactivar desde el selector. Sincronizada por profesional en la base de datos.

Pruebas: engine.test.ts (ecuaciones, aplicabilidad, referencias, comparabilidad, nota determinista), AnthropometryPanel.test.tsx (revisión, evidencia explícita, errores e historia), ConsultationPage.test.tsx (impedir cierre cuando antropometría no se guarda), supabase/tests/database/anthropometry.sql (18 pruebas con fixtures y rollback).

Revisión de asesores: sin alertas de seguridad nuevas en este módulo. Persisten avisos anteriores sobre protección de contraseñas filtradas y la función de reapertura SECURITY DEFINER, además de índices de otros módulos. No se alteraron esas configuraciones en este cambio.
