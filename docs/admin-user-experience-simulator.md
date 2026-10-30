# Simulador de experiencia del usuario

## Uso

1. Abre **Administración → Simulador de usuario**.
2. Elige un plan público activo y el escenario **Usuario nuevo** o **Con datos de ejemplo**.
3. Pulsa **Iniciar recorrido desde la landing**. La pestaña abre la landing y muestra una barra permanente de simulación.
4. Elige un plan en la landing, crea una cuenta con datos ficticios y pulsa **Simular confirmación del correo**. También se puede simular el acceso con Google.
5. Completa la bienvenida. Confirma la contratación simulada y entra al espacio profesional.
6. Recorre los módulos habilitados por ese plan: perfil, pacientes, agenda, consulta, taller de dietas, Superlink, cuenta, créditos y capacitación.
7. **Salir / reiniciar** termina el recorrido y regresa a administración. Inicia otro para comenzar con una cuenta nueva o cambiar el escenario. La barra también permite volver a la landing, a planes o al panel.

Los recorridos duran hasta siete días. El administrador puede finalizarlos desde la lista de recorridos recientes. Cada reinicio termina el recorrido anterior del mismo administrador y prepara un profesional diferente; no borra expedientes reales.

## Arquitectura y aislamiento

- Se utilizan las pantallas existentes y los mismos servicios de guardado, validaciones, cuotas y permisos por plan.
- Una función Edge autenticada comprueba que el actor es administrador en la base de datos y crea una cuenta Auth con correo reservado `example.invalid`. `createUser`, `generateLink` y `verifyOtp` no envían correos en este proceso.
- El marcador permanente `app_metadata.nuthrick_simulation` lo asigna exclusivamente el servidor. El registro privado de recorridos liga al administrador y al profesional, valida el plan y controla vigencia y estado.
- Las credenciales temporales nunca se colocan en URLs. La sesión de prueba se guarda en `sessionStorage` con una clave y canal Auth distintos por recorrido. La sesión administrativa y su selección comercial en `localStorage` se conservan.
- El perfil de simulación carece de permisos administrativos. Las lecturas y escrituras clínicas quedan sujetas a los controles de propietario habituales.
- Los profesionales ficticios se excluyen del resumen administrativo, la lista de profesionales y el selector de cuentas de créditos. Sus perfiles públicos tienen una política restrictiva adicional: solo el profesional de simulación puede leer su página.
- Las acciones del servidor no confían en banderas, identificadores de propietario ni planes privilegiados enviados por el navegador. La función de comandos acepta únicamente usuarios ya verificados por Auth; los RPC de servidor son exclusivos de `service_role`.

## Servicios simulados

- **Contratación, cambio de plan, cancelación y reanudación:** se registran en el recorrido privado, sin crear clientes, suscripciones, pagos ni ingresos de Stripe. El servidor bloquea los comandos de cobro reales de cuentas marcadas.
- **Recargas:** utilizan los paquetes públicos como referencia. El saldo y los comprobantes ficticios se guardan en el recorrido, fuera de los saldos y las compras comerciales. Las respuestas de ejemplo no consumen ese saldo.
- **Correo y Calendar:** disparadores permanentes suprimen sus trabajos externos, incluso después de finalizar el recorrido. Las verificaciones por correo de Superlink también se detectan por su desafío y propietario antes de cualquier envío. La conexión de Calendar tiene un estado de demostración y no obtiene tokens de Google.
- **IA:** el servidor selecciona un proveedor sin red ni claves para cuentas verificadas de simulación. Produce ejemplos identificados, pasa por los contratos, referencias y validaciones existentes y conserva recuperación y aprobación de propuestas. Reserva cero créditos, reporta cero tokens y cero costo. Las cuentas ordinarias conservan su proveedor y contabilidad.
- **Analítica:** las visitas del simulador no se registran como visitas comerciales.

## Alcance de los ejemplos

Los ejemplos permiten evaluar la navegación, redacción de controles, formularios, guardado, aprobaciones y edición. No evalúan la calidad de las respuestas de un modelo real ni constituyen indicaciones clínicas. Las propuestas de dieta son ficticias; las estimaciones de su editor permanecen sin valores reales. Los códigos promocionales reales no se canjean en este entorno y se muestra una explicación si se intenta hacerlo.

El escenario con ejemplos agrega, después de contratar el plan, una paciente ficticia con datos de ficha y, según sus permisos, un borrador de consulta con contexto clínico ficticio, una nota, una cita y un borrador de plan. Los datos se crean únicamente dentro de esa cuenta. El escenario vacío permite evaluar la experiencia inicial sin expedientes precargados.
