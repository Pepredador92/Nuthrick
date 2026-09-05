# Glosario de mediciones registrables

El catálogo visible se organiza en tres grupos: **Mediciones registradas**,
**Bioimpedancia** y **Antropometría**. Los códigos de `measurement_types` son
identificadores estables: una corrección de nombre nunca crea un segundo tipo de
medición ni mueve valores clínicos históricos.

## Renombrados relevantes

| Antes | Visible ahora | Código conservado |
|---|---|---|
| Peso corporal | Peso | `weight` |
| Estatura | Altura | `height` |
| Axilar medio | Axilar medial / Medio axilar | `midaxillary_skinfold` |
| Tríceps | Tríceps / Tricipital | `triceps_skinfold` |
| Bíceps | Bíceps / Bicipital | `biceps_skinfold` |
| Brazo flexionado y contraído | Brazo contraído | `flexed_arm_circumference` |
| Biepicondilar del húmero | Húmero | `humerus_breadth` |
| Biepicondilar del fémur | Fémur | `femur_breadth` |
| Grasa corporal | Grasa (%) | `body_fat_percentage_device` |
| Masa grasa | Grasa | `fat_mass_device` |

## Decisiones y ambigüedades

- **Suprailíaco / Ileocrestal** se presenta como una sola entrada en
  `suprailiac_skinfold`; `iliac_crest_skinfold` sigue siendo **Cresta ilíaca**
  separada. No se fusionaron sus históricos ni sus dependencias.
- **Sumatoria** es una entrada manual (`skinfold_sum_recorded`). No calcula ni
  sustituye los pliegues individuales y no se usa como input de fórmulas.
- **Insulina** manual (`insulin_recorded`) y la de laboratorio
  (`serum_insulin`/`fasting_insulin`) permanecen separadas para no perder el
  origen del dato.
- Las mediciones heredadas fuera del nuevo glosario no se borraron: permanecen
  disponibles para preservar históricos, configuraciones y uso futuro.

## Seguridad de dependencias

El ajuste no cambia ningún código de medición usado por cálculos. También
reconcilia las claves de entrada de Heath-Carter con el contrato validado:
`supraespinale`, `humerus_breadth`, `femur_breadth` y `calf`. Esto permite que
las fórmulas lean los mismos tipos de medición ya presentes en historial,
espacio de trabajo y seguimiento.
