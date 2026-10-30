# Bienvenida para personalizar la consulta

Al entrar al espacio profesional, las cuentas con perfil completo y permiso vigente para editar diseños de entrevista ven una bienvenida a pantalla completa. La ilustración original del bosque nocturno con luciérnagas se sirve como WebP local; el texto y las acciones siguen siendo HTML accesible. La bienvenida conserva su paleta nocturna también con el tema de día.

El texto aprobado es:

> **Personaliza tu consulta**
>
> Antes de atender a tu primer paciente, adapta tu guion de consulta. Revisa las preguntas y elige lo que necesitas de acuerdo con el tiempo previsto para cada consulta.
>
> Un guion bien ajustado te ayuda a mantener la duración de la consulta, cuidar tu energía y evitar que la sesión resulte demasiado larga o cansada para tu paciente.

**Personalizar mi consulta** abre directamente `/app/consultation-templates/initial`, donde se puede alternar a seguimiento. **Hacerlo después**, la X y Escape cierran el aviso y dejan un recordatorio discreto en el Dashboard. La visita al editor no marca por sí sola la configuración como terminada. Guardar un diseño, establecer uno personal como predeterminado o pulsar **Ya revisé mi guion** completa la revisión. Esta última opción permite conservar un diseño válido sin exigir cambios artificiales. No permite confirmar mientras el editor tiene cambios sin guardar.

La preferencia `nuthrick_consultation_setup_v1` en los metadatos del propio usuario conserva `seen_at` y `completed_at` entre sesiones y dispositivos. Es exclusivamente una preferencia de interfaz; no concede acceso, modifica planes ni altera registros clínicos. Se actualiza esa clave con Auth `updateUser`, sin reemplazar otros metadatos. Una caché por usuario evita repetir la bienvenida en el mismo navegador ante una interrupción de red. La confirmación final espera la respuesta del servidor y permite reintentar si falla.

Las cuentas que ya tienen un diseño personal activo no reciben esta interrupción al publicarse la función. El simulador utiliza la misma interfaz y guarda esta preferencia únicamente en su usuario ficticio. No hay solicitudes de IA, nuevos cobros, migraciones ni funciones de servidor para este ajuste.

La bienvenida se atiende antes de montar avisos automáticos, resumen de actividad y consentimiento de IA, para evitar superponerlos. El diálogo nativo mantiene el foco dentro, permite Escape, restaura el foco y bloquea el desplazamiento del fondo; su contenido tiene scroll propio cuando la altura disponible es reducida.
