# Catálogo de equipos de bioimpedancia

## Alcance

Este catálogo registra **salidas reportadas por el equipo**. Nuthrick no vuelve a calcularlas, no les asigna fórmulas antropométricas y no las mezcla con `Datos calculados`. La primera versión prioriza modelos con documentación oficial accesible y mapeos inequívocos.

Consultado y verificado: 5 de septiembre de 2026.

## Fabricantes y modelos incluidos

| Fabricante | Modelo | Tipo | Fuente oficial |
| --- | --- | --- | --- |
| InBody | 270S | DSM-MFBIA, segmental | [Producto](https://inbodyusa.com/products/inbody-270s/) y [hoja de resultados](https://shop.inbodyusa.com/products/inbody-270s-result-sheets) |
| InBody | 770S | DSM-MFBIA, segmental y agua corporal avanzada | [Producto](https://inbodyusa.com/products/inbody770s/) |
| Tanita | MC-780U Plus | BIA multifrecuencia segmental | [Producto](https://tanita.com/EN-US/products/mc-780uplus) |
| Omron | HBF-514C | BIA cuerpo completo, 50 kHz | [Producto](https://omronhealthcare.com/products/body-composition-monitor-and-scale-with-seven-fitness-indicators-hbf-514c) |
| Omron | BCM-500 | BIA pie a pie, 50 kHz | [Producto](https://omronhealthcare.com/products/body-composition-monitor-and-scale-with-bluetooth-connectivity-bcm-500) y [manual](https://omronhealthcare.com/storage/pdfs/body-composition-monitor-and-scale-with-bluetooth-bcm500-im-en_5022647-0d.pdf) |
| seca | mBCA 555 | BIA médica de ocho puntos | [Ficha técnica](https://www.seca.com/fileadmin/documents/product_sheet/seca_pst__mBCA_555_en.pdf) |
| seca | mBCA Go 525c | BIA médica de ocho puntos en decúbito | [Ficha técnica](https://www.seca.com/fileadmin/documents/product_sheet/seca_pst_mBCA-Go_int_en.pdf) |

## Criterio de mapeo

- `verified`: el nombre o equivalente clínico y la unidad aparecen de forma explícita en la fuente oficial. Solo estos campos se muestran automáticamente.
- `ambiguous`: existe una salida comercial, pero la documentación consultada no permite establecer con seguridad variable, unidad o segmento. No se muestra automáticamente.
- `proprietary`: puntaje o clasificación propia sin equivalencia clínica directa. No se convierte en otra variable.
- Las unidades canónicas conservadas son `kg`, `%`, `L`, `°`, `cm²`, `Ω`, `kcal/día`, `años`, `ratio` y `puntaje`.
- No se generan segmentos “tronco superior” o “tronco inferior” salvo que un modelo los documente expresamente. Ningún equipo inicial los activa.

## Variables verificadas por modelo

### InBody 270S

Peso, agua corporal total, masa grasa, porcentaje de grasa corporal, masa muscular esquelética, ángulo de fase de cuerpo completo y masa magra segmental de brazo izquierdo, brazo derecho, pierna izquierda, pierna derecha y tronco.

### InBody 770S

Peso, agua corporal total, agua intracelular, agua extracelular, relación ECW/TBW, masa grasa, porcentaje de grasa corporal, masa muscular esquelética, área de grasa visceral, ángulo de fase de cuerpo completo, impedancia y masa magra de cinco segmentos.

### Tanita MC-780U Plus

Peso, masa y porcentaje de grasa, masa muscular, valoración de grasa visceral, porcentaje y masa de agua corporal total, agua intracelular y extracelular, metabolismo basal, edad metabólica, masa ósea, ángulo de fase, masa libre de grasa e impedancia/resistencia.

La página oficial también enumera resultados segmentales, pero su resumen no distingue de forma suficiente todos los segmentos y unidades para el glosario de Nuthrick; por eso no se activan todavía.

### Omron HBF-514C

Peso, porcentaje de grasa, porcentaje de músculo esquelético, metabolismo en reposo, nivel de grasa visceral y edad corporal. El IMC que muestra el equipo no se captura en esta etapa porque Nuthrick ya conserva su propio resultado calculado y deben permanecer separados.

### Omron BCM-500

Peso, porcentaje de grasa, porcentaje de músculo esquelético, metabolismo en reposo y nivel de grasa visceral. El IMC se excluye por la misma razón anterior.

### seca mBCA 555

Peso, masa muscular esquelética, masa grasa, masa libre de grasa, agua corporal total y ángulo de fase. La fuente confirma grasa visceral, pero no una unidad compatible inequívoca; queda documentada como ambigua y no se muestra automáticamente.

### seca mBCA Go 525c

Masa muscular, masa grasa, agua corporal total, agua intracelular, agua extracelular y ángulo de fase. La fuente no presenta el peso como salida de la plataforma, por lo que no se activa. La grasa visceral queda ambigua por unidad y tampoco se activa.

## Ambigüedades conservadas

- “Grasa visceral” puede ser puntaje, nivel, área o masa según fabricante. Nuthrick solo usa `puntaje` cuando la fuente habla de rating/level y `cm²` cuando declara área.
- “Masa muscular”, “masa muscular esquelética” y “masa magra” no son sinónimos. Cada modelo se mapea únicamente al término publicado.
- “Metabolismo basal” y “metabolismo en reposo” se conservan bajo el campo reportado por equipo sin atribuir una ecuación.
- Los puntajes de físico, músculo, control o composición no se transforman en medidas clínicas.
- La impedancia multifrecuencia/segmental no se descompone por frecuencia o segmento en esta versión porque el glosario todavía no representa esa matriz sin pérdida.

## Procedencia e historial

Cada registro guarda una sesión de equipo con:

- equipo físico del profesional;
- fabricante, modelo, nombre comercial, tecnología y condición estándar/personalizada;
- alias, serie e identificador interno existentes al capturar;
- consulta, paciente, fecha y origen de captura;
- variable, valor y unidad canónica.

La sesión contiene una instantánea. Cambiar el alias o desactivar el equipo no altera registros anteriores. Una consulta puede tener varios equipos y cada combinación equipo-variable conserva su propio resultado; no se sobrescriben entre sí.

## Equipos personalizados

Un equipo no incluido puede registrarse como privado. El profesional declara fabricante, modelo, alias y capacidades. Esto no lo promueve al catálogo estándar y no crea resultados vacíos. La interfaz advierte que solo deben marcarse variables que el dispositivo efectivamente reporte.

## Exclusiones deliberadas

- Interpretación clínica automática de bioimpedancia.
- Recalcular resultados propietarios del fabricante.
- Importación PDF, OCR, CSV, Bluetooth o API.
- Evolución longitudinal y gráficos.
- Nuevas fórmulas antropométricas.
- Conversión silenciosa del peso del equipo en el peso manual de la consulta.
