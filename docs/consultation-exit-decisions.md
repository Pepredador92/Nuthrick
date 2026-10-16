# Decisión al salir de una consulta

Implementación local del 16 de octubre de 2026. La publicación requiere aplicar la migración `20261016221253_discard_unfinished_consultation_draft.sql` antes de desplegar el frontend.

## Comportamiento

- Al salir de una consulta se pregunta si se guarda como borrador, se elimina o se continúa. El aviso aparece aunque el autoguardado haya terminado o no se hayan introducido respuestas.
- Se conserva el destino solicitado: ficha, pacientes, mensajes, otra sección, Atrás/Adelante o cierre de sesión. La sesión se revoca al entrar en `/logout`, después de resolver la consulta.
- Guardar termina la cola de respuestas y conserva una fecha editada antes de navegar. Un fallo mantiene la consulta y el aviso abiertos para reintentar.
- Las capturas pendientes de mediciones, bioimpedancia, laboratorios, recordatorio y propuesta PES requieren su guardado o confirmación propios. El aviso identifica esas secciones y permite volver a revisarlas; no abandona sus ediciones ni aprueba automáticamente propuestas clínicas.
- Recargar, cerrar la pestaña o navegar fuera de la aplicación utiliza el aviso nativo del navegador. Ese aviso no admite las tres opciones personalizadas. El borrador y la recuperación de entrevista existentes se mantienen para reanudar.
- Nueva consulta muestra abiertos los borradores del paciente. Reanudar o eliminar el pendiente precede a iniciar otra consulta, incluso si se elige otro tipo. El inicio existente sigue reutilizando un borrador del mismo tipo bajo bloqueo del paciente en la base.

La aplicación usa el router de datos de React Router para cubrir enlaces, navegación programática y navegación del historial con [`useBlocker`](https://reactrouter.com/api/hooks/useBlocker). Los cambios de paso dentro de la consulta continúan en la misma pantalla. La finalización clínica explícita continúa hacia la ficha sin una segunda confirmación de salida.

## Descarte de datos

`discard_consultation_draft` es una RPC nueva. La retirada histórica existente `delete_consultation_record` sigue siendo una operación distinta.

El descarte comprueba identidad, permiso comercial y propiedad, bloquea la consulta y exige un borrador sin finalización ni retirada previas. Protege notas clínicas, registros antiguos, planes vinculados y versiones publicadas. La columna `draft_discard_protected` conserva la protección cuando se reabre una consulta cerrada; el cliente no puede restablecerla a falso. Para revisiones antiguas, las copias de una misma versión de plantilla se protegen de forma conservadora porque podían proceder de una reapertura anterior a esta marca.

Se eliminan resultados y reportes de laboratorio mientras sus padres aún existen, para respetar sus validadores. Las claves foráneas existentes eliminan las respuestas, snapshots, capturas, cálculos, antropometría y sesiones de equipos exclusivamente de ese borrador. Todo sucede en una transacción: cualquier error revierte el descarte. No se restituye consumo comercial ni créditos de IA.

La función privilegiada queda en `private`, con `search_path` vacío y autorización explícita. El punto público es `security invoker`. Solo `authenticated` puede ejecutar ambos puntos y la llamada anónima se rechaza. Un identificador inexistente o ajeno es una operación sin efecto, que no revela su existencia y permite reintentar tras una respuesta perdida.

No se ejecuta una limpieza automática de borradores existentes. Cada descarte necesita la elección del usuario.

## Verificación

- Pruebas de frontend en consulta, servicio de consultas, ficha de paciente, menú profesional y cierre de sesión: guardado del último cambio, navegación lateral/programática/Atrás, borrador ya autoguardado, errores y reintentos, cola en curso, fecha, capturas pendientes, consulta reabierta y navegación durante el inicio.
- `node scripts/test-consultation-discard.mjs`: PostgreSQL desechable con validadores reales de laboratorio, cascadas, protección histórica y de planes, aislamiento por propietario, permisos, acceso comercial, reintento y reversión completa ante fallo simulado. Solo datos sintéticos; la base de prueba se elimina al terminar.
- TypeScript, ESLint de archivos modificados y compilación de producción.
- Vista offline con el componente real en `/tests/visual/consultation-flow.html`: guardar al salir hacia mensajes, volver al paciente y reanudar la misma respuesta. Aviso revisado en tema nocturno y foco inicial en continuar.

No se modificaron consultas reales ni se aplicó la migración a producción en este ajuste local.
