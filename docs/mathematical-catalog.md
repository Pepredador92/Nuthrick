# Catálogo matemático de Nuthrick

Versión de especificación: Objetivo 5A · 4 de septiembre de 2026.

Este documento resume la fuente de verdad almacenada en `calculation_definitions.definition`. La migración contiene el contrato ejecutable completo (inputs, unidades, ecuaciones, coeficientes, condiciones, población, referencias y decisiones). En 5A sólo permanecen ejecutables IMC, ICC e ICT; validar un contrato no cambia su estado de implementación.

## Estados

- `validated`: definición suficiente para programar sin volver a decidir ecuación, coeficientes, sitios o unidades.
- `requires_decision`: la evidencia permite describir alternativas, pero falta una decisión explícita de producto/metodología.
- `pending_evidence`: no existe evidencia suficiente para adoptar con seguridad una variante.

El estado de inputs es independiente:

- `empty`: ningún requisito está disponible.
- `partial`: existe una parte de los requisitos.
- `complete`: están disponibles todos los inputs directos y dependencias.

Estar en el espacio de trabajo no vuelve disponible una medición: debe existir un valor real en la consulta.

## Contratos revisados

| Código | Resultado / método | Inputs directos | Dependencias | Validación | Runtime |
|---|---|---|---|---|---|
| `bmi` | IMC | peso (kg, consulta), estatura (cm, expediente) | — | validated | implemented |
| `waist_hip_ratio` | Relación cintura/cadera | cintura (cm), cadera/glúteo (cm) | — | validated | implemented |
| `waist_height_ratio` | Relación cintura/talla | cintura (cm), estatura (cm, expediente) | — | validated | implemented |
| `density_jackson_pollock_3` | Densidad · JP3 | sexo y edad automáticos; 3 pliegues según variante | — | validated | pending |
| `density_jackson_pollock_7` | Densidad · JP7 | sexo, edad y 7 pliegues (mm) | — | validated | pending |
| `density_durnin_womersley` | Densidad · Durnin-Womersley | sexo, edad; bíceps, tríceps, subescapular y suprailíaco (mm) | — | validated | pending |
| `body_fat_jp3_siri` | % grasa · Siri | — | densidad JP3 | validated | pending |
| `body_fat_jp7_siri` | % grasa · Siri | — | densidad JP7 | validated | pending |
| `body_fat_jp7_brozek` | % grasa · Brozek | — | densidad JP7 | validated | pending |
| `body_fat_durnin_siri` | % grasa · Siri | — | densidad Durnin-Womersley | validated | pending |
| `body_fat_faulkner` | % grasa · atribuido a Faulkner | variantes documentadas, ninguna adoptada | — | pending_evidence | pending |
| `body_fat_yuhasz` | % grasa · Yuhasz/adaptaciones | variantes documentadas, ninguna adoptada | — | requires_decision | pending |
| `fat_mass_jp7_siri` | Masa grasa (kg) | peso (kg) | % grasa JP7 + Siri | validated | pending |
| `fat_free_mass_jp7_siri` | Masa libre de grasa (kg) | peso (kg) | masa grasa JP7 + Siri | validated | pending |
| `muscle_mass_lee` | Masa muscular esquelética (kg) | talla, 3 perímetros, 3 pliegues, sexo, edad y grupo del modelo | — | requires_decision | pending |
| `somatotype_endomorphy` | Endomorfia | tríceps, subescapular, supraespinal, talla | — | validated | pending |
| `somatotype_mesomorphy` | Mesomorfia | diámetros humeral/femoral, brazo flexionado, tríceps, pantorrilla máxima, pliegue de pantorrilla, talla | — | validated | pending |
| `somatotype_ectomorphy` | Ectomorfia | talla, peso | — | validated | pending |
| `somatochart_coordinates` | Coordenadas X/Y | — | endomorfia, mesomorfia, ectomorfia | validated | pending |

## Ecuaciones listas para 5B

### Índices

- IMC: `peso_kg / (talla_cm / 100)²`.
- ICC: `cintura_cm / cadera_cm`.
- ICT: `cintura_cm / talla_cm`.

### Jackson & Pollock 3

- Masculina, 18–61 años: pectoral + abdominal + muslo anterior. `D = 1.10938 − 0.0008267·S3 + 0.0000016·S3² − 0.0002574·edad`.
- Femenina, 18–55 años: tríceps + suprailíaco + muslo anterior. `D = 1.0994921 − 0.0009929·S3 + 0.0000023·S3² − 0.0001392·edad`.

Los pliegues son mm y el resultado es g/cm³. La publicación femenina pide cautela adicional en mayores de 40 años.

### Jackson & Pollock 7

`S7 = pectoral + axilar medio + tríceps + subescapular + suprailíaco + abdominal + muslo anterior`, en mm.

- Masculina, 18–61 años: `D = 1.112 − 0.00043499·S7 + 0.00000055·S7² − 0.00028826·edad`.
- Femenina, 18–55 años: `D = 1.097 − 0.00046971·S7 + 0.00000056·S7² − 0.00012828·edad`.

### Durnin & Womersley

`S4 = bíceps + tríceps + subescapular + suprailíaco`, en mm; `D = c − m·log10(S4)`.

| Sexo | Edad | c | m |
|---|---:|---:|---:|
| Masculino | 17–19 | 1.1620 | 0.0630 |
| Masculino | 20–29 | 1.1631 | 0.0632 |
| Masculino | 30–39 | 1.1422 | 0.0544 |
| Masculino | 40–49 | 1.1620 | 0.0700 |
| Masculino | 50–72 | 1.1715 | 0.0779 |
| Femenino | 16–19 | 1.1549 | 0.0678 |
| Femenino | 20–29 | 1.1599 | 0.0717 |
| Femenino | 30–39 | 1.1423 | 0.0632 |
| Femenino | 40–49 | 1.1333 | 0.0612 |
| Femenino | 50–68 | 1.1339 | 0.0645 |

No se adoptan las ecuaciones agregadas de todas las edades.

### Conversiones y compartimentos

- Siri: `% grasa = (4.95 / D − 4.50) × 100`.
- Brozek: `% grasa = (4.570 / D − 4.142) × 100`.
- Masa grasa: `peso_kg × porcentaje_grasa / 100`.
- Masa libre de grasa: `peso_kg − masa_grasa_kg`.

Siri y Brozek son conversiones distintas y nunca se sustituyen entre sí. Cada compartimento conserva el método que produjo su porcentaje.

### Heath-Carter

- Endomorfia: `X=(tríceps+subescapular+supraespinal)·(170.18/talla_cm)`; `−0.7182+0.1451X−0.00068X²+0.0000014X³`.
- Mesomorfia: `0.858·húmero + 0.601·fémur + 0.188·CAG + 0.161·CCG − 0.131·talla + 4.5`, con `CAG=brazo flexionado y contraído_cm−tríceps_mm/10` y `CCG=pantorrilla máxima_cm−pantorrilla medial_mm/10`.
- Ectomorfia: `HWR=talla_cm/∛peso_kg`; `0.732·HWR−28.58` si HWR≥40.75; `0.463·HWR−17.63` si 38.25<HWR<40.75; `0.1` si HWR≤38.25.
- Somatocarta: `X=ectomorfia−endomorfia`; `Y=2·mesomorfia−(endomorfia+ectomorfia)`.

Un componente calculado como cero o negativo se registra como 0.1. La corrección de perímetros de Heath-Carter no usa π y no debe confundirse con Lee.

## Decisiones abiertas

### Lee

El modelo 1 queda documentado como candidato:

`MM = talla_m·(0.00744·CAG² + 0.00088·CTG² + 0.00441·CCG²) + 2.4·sexo − 0.048·edad + grupo + 7.8`.

Los perímetros se corrigen como `perímetro_cm − π·(pliegue_mm/10)`. El estudio codifica el término poblacional como −2.0 para personas asiáticas, +1.1 para afroamericanas y 0 para blancas o hispanas. Nuthrick no dispone de un campo acordado para ese término y no asumirá cero. Debe decidirse cómo representarlo o si se adopta otro modelo antes de programar.

### Yuhasz

Quedan documentadas por separado:

- tesis original, hombres jóvenes: seis pliegues y `3.641 + 0.0970·S6`;
- tesis original, hombres adultos: seis pliegues y `4.975 + 0.1066·S6`;
- adaptación posterior para atletas atribuida habitualmente a Yuhasz/Carter, con otros sitios y coeficientes por sexo.

Debe elegirse población y variante. El catálogo no activa ninguna automáticamente.

### Faulkner

La fórmula publicada frecuentemente como `5.783 + 0.153·S4` queda registrada sólo como candidata no adoptada. La fuente secundaria especializada señala una atribución histórica incierta y la literatura alterna supraespinal/suprailíaco y otros coeficientes. Se requiere evidencia primaria suficiente antes de adoptar un contrato.

## Nomenclatura y códigos

- `suprailiac_skinfold`: pliegue suprailíaco usado por Jackson-Pollock y Durnin-Womersley.
- `iliac_crest_skinfold`: pliegue de cresta ilíaca; existe en el catálogo pero no sustituye automáticamente al anterior.
- `supraespinale_skinfold`: pliegue supraespinal usado por Heath-Carter.
- `abdominal_skinfold` no es `waist_circumference`.
- `thigh_skinfold` no es `mid_thigh_circumference`.
- `calf_circumference` no es `calf_skinfold`.
- Lee usa `relaxed_arm_circumference`; Heath-Carter usa `flexed_arm_circumference`.

No fue necesario crear ni renombrar mediciones. Todos los sitios exactos ya existen con códigos estables.

## Dependencias

```text
density_jackson_pollock_3 ──> body_fat_jp3_siri

density_jackson_pollock_7 ──> body_fat_jp7_siri ──> fat_mass_jp7_siri ──> fat_free_mass_jp7_siri
                           └─> body_fat_jp7_brozek

density_durnin_womersley ──> body_fat_durnin_siri

somatotype_endomorphy ─┐
somatotype_mesomorphy ─┼─> somatochart_coordinates
somatotype_ectomorphy ─┘
```

## Referencias metodológicas

- Jackson AS, Pollock ML (1978). *Generalized equations for predicting body density of men*. DOI 10.1079/BJN19780152.
- Jackson AS, Pollock ML, Ward A (1980). *Generalized equations for predicting body density of women*. PMID 7402053.
- Durnin JVGA, Womersley J (1974). *Body fat assessed from total body density and its estimation from skinfold thickness*. DOI 10.1079/BJN19740060.
- Siri WE (1961). *Body composition from fluid spaces and density: analysis of methods*.
- Brozek J, Grande F, Anderson JT, Keys A (1963). *Densitometric analysis of body composition*. DOI 10.1111/j.1749-6632.1963.tb17079.x.
- Lee RC et al. (2000). *Total-body skeletal muscle mass: development and cross-validation of anthropometric prediction models*. DOI 10.1093/ajcn/72.3.796.
- Carter JEL (2002). *The Heath-Carter Anthropometric Somatotype: Instruction Manual*.
- Yuhasz MS (1962). *The effects of sports training on body fat in man with predictions of optimal body weight*.
- Canda AS, Esparza F (2009). *The Faulkner equation for predicting body fat: the end of a myth*.

## Métodos recomendados para futura incorporación

No se agregaron al catálogo de producción.

| Método | Finalidad | Población | Inputs principales | Razón |
|---|---|---|---|---|
| Slaughter et al. | % de grasa por pliegues | Niñez y adolescencia, con reglas por sexo/maduración/población | tríceps, subescapular; sexo y maduración según variante | Evita aplicar ecuaciones adultas a menores, pero requiere diseñar el dato de maduración y escoger variantes. |
| Jackson-Pollock-Ward de 4 sitios | Densidad corporal | Mujeres adultas del contexto original | abdomen, suprailíaco, tríceps, muslo; edad | Variante difundida del mismo programa de ecuaciones; sólo añadir si aporta un flujo clínico solicitado. |
| Deurenberg (BMI-edad-sexo) | Estimación poblacional de % grasa | Adultos o menores según ecuación específica | IMC, edad, sexo | Útil cuando no hay pliegues, pero no es equivalente a una evaluación individual de composición corporal. |
| Modelos pediátricos multicompartimentales/ajustados | % de grasa | Poblaciones pediátricas específicas | depende del modelo | La composición de masa libre de grasa cambia con la maduración; se requiere un objetivo pediátrico separado. |

## Criterio para 5B

Se pueden programar sin nueva investigación: JP3, JP7, Durnin-Womersley, las cuatro conversiones Siri/Brozek ya catalogadas, masa grasa, masa libre de grasa, endomorfia, mesomorfia y ectomorfia. Las coordenadas de somatocarta están matemáticamente definidas, pero 5B debe admitir un resultado X/Y en vez de forzarlo a un único escalar.

No se deben programar todavía Lee, Yuhasz ni Faulkner.
