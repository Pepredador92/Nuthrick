# Catálogo científico de interpretación antropométrica

Versión de implementación: Objetivo 6B · 5 de septiembre de 2026.

Este documento audita los resultados que Nuthrick calcula actualmente. La matemática y la interpretación permanecen separadas: una ecuación validada puede producir un número sin que exista una clasificación clínica defendible para ese número. En ese caso Nuthrick conserva el resultado, la unidad, el método y su procedencia, pero no inventa una etiqueta.

## Estados metodológicos

- **Validado**: existe una referencia identificable, con población, unidad, límites y condiciones reproducibles. Se programa automáticamente.
- **Validado descriptivo**: existe una nomenclatura reproducible, pero describe morfología; no expresa salud, diagnóstico ni riesgo.
- **Requiere decisión metodológica**: existe evidencia candidata, pero no es correcto escoger o generalizar una tabla automáticamente.
- **Sin referencia directa**: no se encontró una clasificación defendible para el valor y la unidad actuales.
- **Requiere otra métrica**: la literatura interpreta un valor normalizado o distinto, no el resultado absoluto que Nuthrick calcula.

## Auditoría por resultado

| Resultado actual | Estado | Población, sexo y edad | Categorías disponibles | Limitaciones y decisión de Nuthrick | Fuente |
| --- | --- | --- | --- | --- | --- |
| IMC (`bmi`) | Validado | Personas adultas desde 18 años; ambos sexos; se excluye gestación confirmada | Bajo peso; peso normal; sobrepeso/preobesidad; obesidad I, II y III | Usa el valor interno sin redondear. No aplica clasificación adulta a menores. No ajusta por composición corporal, etnia o edad avanzada. | [OMS, WHO TRS 894 (2000)](https://iris.who.int/bitstream/10665/42330/1/WHO_TRS_894.pdf) |
| Índice cintura-cadera (`waist_hip_ratio`) | Validado | Personas adultas; punto de corte específico por sexo para ecuaciones | Por debajo del punto de corte; riesgo sustancialmente aumentado | Conserva la terminología de riesgo de la fuente; no llama “normal” al valor inferior. Requiere sexo del expediente. | [OMS, Waist Circumference and Waist-Hip Ratio (2011)](https://www.who.int/publications/i/item/9789241501491) |
| Índice cintura-talla (`waist_height_ratio`) | Validado | Personas adultas con IMC menor de 35 kg/m²; ambos sexos | Adiposidad central saludable, aumentada o alta | No clasifica valores menores de 0.40 ni casos con IMC ≥35. Requiere IMC de la misma consulta. | [NICE NG246, recomendación 1.9.14](https://www.nice.org.uk/guidance/ng246/chapter/Identifying-and-assessing-overweight-obesity-and-central-adiposity) |
| Grasa - Siri · Jackson-Pollock 3 (`body_fat_jp3_siri`) | Requiere decisión metodológica | Las ecuaciones de origen ya delimitan sexo y edad; la interpretación del porcentaje final necesitaría además una población compatible | Ninguna automática | Gallagher ofrece rangos provisionales dependientes de sexo y edad, pero no valida una tabla universal para todo porcentaje estimado por pliegues/densidad. Se conserva la procedencia JP3 + Siri y no se generaliza. | [Gallagher et al. (2000)](https://pubmed.ncbi.nlm.nih.gov/10966886/); [revisión de métodos de campo (2023)](https://doi.org/10.1007/s13679-022-00488-8) |
| Grasa - Siri · Jackson-Pollock 7 (`body_fat_jp7_siri`) | Requiere decisión metodológica | Igual que el anterior, con población del método JP7 | Ninguna automática | No se adopta una tabla independiente del método sin validación explícita para la cadena JP7 + Siri. | Mismas fuentes anteriores |
| Grasa - Siri · Durnin-Womersley (`body_fat_durnin_siri`) | Requiere decisión metodológica | Igual que el anterior, con bandas de sexo y edad propias de Durnin-Womersley | Ninguna automática | No se asume que un porcentaje Siri derivado de Durnin-Womersley sea intercambiable para clasificación con JP3 o JP7. | Mismas fuentes anteriores |
| Grasa - Brozek · Jackson-Pollock 7 (`body_fat_jp7_brozek`) | Requiere decisión metodológica | Población de JP7 y supuestos de la conversión Brozek | Ninguna automática | Siri y Brozek son conversiones distintas. Producir la misma unidad no demuestra que deban compartir rangos de interpretación. | [Brozek et al. (1963)](https://doi.org/10.1111/j.1749-6632.1963.tb17079.x); [revisión de métodos de campo (2023)](https://doi.org/10.1007/s13679-022-00488-8) |
| Masa grasa · JP3 + Siri (`fat_mass_jp3_siri`) | Sin referencia directa | No aplica una tabla aceptada al valor absoluto en kg | Ninguna automática | Se muestra como compartimento derivado del porcentaje y del peso, con procedencia completa. No hereda una categoría del porcentaje de forma implícita. | Auditoría de composición corporal; sin referencia clasificatoria directa adoptada |
| Masa grasa · JP7 + Siri (`fat_mass_jp7_siri`) | Sin referencia directa | Igual | Ninguna automática | Igual; coexiste sin sobrescribir otras procedencias. | Igual |
| Masa grasa · JP7 + Brozek (`fat_mass_jp7_brozek`) | Sin referencia directa | Igual | Ninguna automática | Igual; conserva específicamente JP7 + Brozek. | Igual |
| Masa grasa · Durnin-Womersley + Siri (`fat_mass_durnin_siri`) | Sin referencia directa | Igual | Ninguna automática | Igual; conserva específicamente Durnin-Womersley + Siri. | Igual |
| Masa libre de grasa · JP3 + Siri (`fat_free_mass_jp3_siri`) | Requiere otra métrica | Las referencias poblacionales requieren normalización por talla y estratificación por sexo/edad | Ninguna automática | El valor absoluto en kg no recibe bajo/normal/alto. Una incorporación futura podría evaluar el índice de masa libre de grasa, pero sería una fórmula nueva y queda fuera de este objetivo. | [Kyle et al. (2003)](https://pubmed.ncbi.nlm.nih.gov/12831945/) |
| Masa libre de grasa · JP7 + Siri (`fat_free_mass_jp7_siri`) | Requiere otra métrica | Igual | Ninguna automática | Igual; no se confunde masa libre de grasa con masa muscular. | Igual |
| Masa libre de grasa · JP7 + Brozek (`fat_free_mass_jp7_brozek`) | Requiere otra métrica | Igual | Ninguna automática | Igual; conserva específicamente JP7 + Brozek. | Igual |
| Masa libre de grasa · Durnin-Womersley + Siri (`fat_free_mass_durnin_siri`) | Requiere otra métrica | Igual | Ninguna automática | Igual; conserva específicamente Durnin-Womersley + Siri. | Igual |
| Endomorfia (`somatotype_endomorphy`) | Validado descriptivo | Personas con componente Heath-Carter calculado; no depende de una tabla clínica por sexo/edad | Baja 0.5–2.5; moderada 3–5; alta 5.5–7; muy alta ≥7.5 | Describe adiposidad relativa dentro del somatotipo. Para escoger el descriptor se reporta a la media unidad más cercana; el resultado decimal original se conserva. | [Carter, manual Heath-Carter (2002)](https://mdthinducollege.org/ebooks/statistics/Heath-CarterManual.pdf) |
| Mesomorfia (`somatotype_mesomorphy`) | Validado descriptivo | Igual | Baja; moderada; alta; muy alta, con los mismos intervalos de magnitud | Describe robustez musculoesquelética relativa; no es masa muscular ni categoría de salud. | Mismo manual |
| Ectomorfia (`somatotype_ectomorphy`) | Validado descriptivo | Igual | Baja; moderada; alta; muy alta, con los mismos intervalos de magnitud | Describe linealidad relativa; no es categoría de salud o riesgo. | Mismo manual |
| Somatocarta X/Y (`somatochart_coordinates`) | Validado descriptivo como somatotipo completo | Requiere los tres componentes Heath-Carter de la misma evaluación | Central y las 12 categorías combinadas reconocidas | X/Y permanecen como coordenadas numéricas. La etiqueta se obtiene de la relación formal entre los tres componentes, no de cuadrantes inventados. | Mismo manual, sección *Somatotype categories* |

## Reglas de somatotipo completo

Las comparaciones usan los tres componentes decimales sin redondear. Se aplica primero la definición de **central**: ningún componente difiere más de una unidad de los otros dos. Después se evalúan pares que no difieren más de 0.5 y, finalmente, el componente dominante y el orden de los otros dos.

Las 13 etiquetas reproducibles son:

1. Somatotipo central.
2. Endomorfo balanceado.
3. Endomorfo mesomórfico.
4. Meso-endomorfo.
5. Mesomorfo endomórfico.
6. Mesomorfo balanceado.
7. Mesomorfo ectomórfico.
8. Meso-ectomorfo.
9. Ectomorfo mesomórfico.
10. Ectomorfo balanceado.
11. Ectomorfo endomórfico.
12. Endo-ectomorfo.
13. Endomorfo ectomórfico.

Estas etiquetas son morfológicas. Nuthrick no las traduce a bueno/malo, saludable/no saludable, diagnóstico, obesidad o riesgo.

## Decisión sobre porcentaje de grasa

La publicación de Gallagher et al. propuso rangos provisionales relacionados con IMC a partir de una muestra adulta estratificada por sexo, edad y grupo étnico; el propio trabajo parte de que no existían rangos publicados universalmente aceptados. Eso no demuestra aplicabilidad automática a cada porcentaje producido por las cadenas de pliegues y densidad de Nuthrick. La revisión contemporánea de métodos de campo también documenta que la validez depende de ecuación, población y supuestos del método.

Por ello los cuatro porcentajes permanecen en **requiere decisión metodológica**. La arquitectura ya puede expresar sexo, edad, población, método, intervalos y referencias múltiples; cuando se adopte una población y una referencia compatible, cada procedencia podrá recibir su propia interpretación sin sobrescribir a las demás.

## Masa grasa y masa libre de grasa

No se encontró una clasificación clínica general defendible para masa grasa absoluta en kg. Tampoco se asigna una clasificación al valor absoluto de masa libre de grasa: las referencias de utilidad poblacional normalizan por talla mediante FMI/FFMI y consideran sexo y edad. Introducir esos índices sería agregar resultados matemáticos nuevos, expresamente fuera del alcance 6B.

La masa libre de grasa no se renombra ni interpreta como masa muscular o masa músculo-esquelética.

## Edad, sexo y contexto histórico

- La edad procede de la fecha de nacimiento del expediente y se calcula en la fecha y zona horaria de la consulta.
- El sexo procede de `equation_sex`; no se infiere del género, nombre o apariencia.
- El embarazo sólo se usa cuando está explícitamente confirmado o descartado para la consulta.
- El IMC de aplicabilidad corresponde a la misma consulta.
- Los componentes del somatotipo pertenecen al mismo conjunto calculado; si falta uno, no se crea categoría combinada.

No se vuelve a pedir la edad ni el sexo en Mediciones. Al revisar una consulta antigua nunca se usa la edad actual.

## Persistencia y trazabilidad

Cada interpretación guardada conserva un snapshot completo de valor interno, unidad, contexto, regla, referencia, versión, consulta y fecha. Una actualización que no cambia el resultado, sus inputs, dependencias o valores compuestos conserva el snapshot incluso si posteriormente se agregan campos de contexto o cambia el catálogo activo. No hay backfill ni reinterpretación silenciosa.

En una consulta nueva, la interpretación aplicable se calcula reactivamente y se persiste al guardar. En un resultado histórico sin interpretación se mantiene `null`; el valor numérico y su procedencia no desaparecen.

## Presentación

Resultados mantiene el número como elemento principal. Sólo las interpretaciones `classified` muestran una etiqueta discreta debajo. Los estados sin referencia, contexto faltante, no aplicable o decisión pendiente no añaden ruido permanente.

`Ver detalles` concentra:

- categoría y descripción;
- valor interno y, para magnitudes Heath-Carter, valor a media unidad usado sólo para el descriptor;
- intervalo exacto e inclusividad;
- referencia interpretativa, organización/autores, año, versión y enlace;
- población, contexto y fecha;
- notas y limitaciones;
- acceso separado al método y su referencia matemática.

Somatotipo presenta los tres componentes y X/Y juntos, una sola categoría completa y un solo detalle que reúne la trazabilidad de los cuatro resultados.

## Alcance excluido

No se implementaron evolución, bioimpedancia, laboratorios, Faulkner, Yuhasz, Hodgdon & Beckett, Lean, Lee, peso ideal ni ninguna fórmula nueva. Tampoco se cambió el motor matemático existente.

## Evidencia de validación

- Pruebas unitarias de cada límite IMC, ICC e ICT.
- Pruebas del redondeo Heath-Carter exactamente antes y en 2.75, 5.25 y 7.25, conservando el valor original.
- Pruebas independientes de las 13 categorías somatotípicas y del contexto incompleto.
- Pruebas de ausencia deliberada de referencia para porcentaje, masa grasa y masa libre de grasa.
- Prueba de referencias múltiples, defaults, solapamientos y decisión metodológica.
- Prueba de dos consultas separadas y preservación de snapshots tras cambiar una referencia activa.
- Pruebas de RLS, consulta finalizada y eliminación de resultados obsoletos.
- Verificación visual responsiva a 360, 768 y 1280 px con componentes reales.

La fuente de verdad activa vive en `public.interpretation_references`; `frontend/src/features/interpretations/references.json` es su semilla versionada y el respaldo de pruebas aisladas. La migración `20260905161402_expand_scientific_interpretation_catalog.sql` mantiene ambas definiciones alineadas y `20260905164041_preserve_explicit_interpretation_context_changes.sql` protege el historial sin bloquear una edición explícita del contexto clínico en un borrador.
