# Support — módulo compartido RBAC

Módulo compartido para el área de trabajadores de Modira.

## Permisos

Según la matriz de permisos proporcionada para este proyecto:

- `support.read`: Direction, Developer, Support
- `support.create`: Direction, Support
- `support.update`: Direction, Support
- `support.delete`: Direction, Support

Por tanto:

- **Direction:** acceso completo de soporte.
- **Support:** acceso completo de soporte.
- **Developer:** solo lectura.
- **Commercial:** sin acceso.
- **Accounting:** sin acceso.

El frontend usa `hasPermission()` para controlar el acceso y las acciones visibles, pero la seguridad real continúa dependiendo de RLS/RPC en Supabase.

## Componentes

- `SupportArea.tsx`: entrada del módulo y carga del listado.
- `Support.tsx`: listado, filtros, métricas y responsive.
- `SupportTicketDetail.tsx`: detalle, edición y cierre protegido.
- `SupportUI.tsx`: componentes visuales compartidos.
- `supportTypes.ts`: tipos, estados, prioridades y códigos de permisos.
- `index.ts`: exports.

## Backend existente preservado

Se mantienen las operaciones que ya utilizaba `EmployeeSupport`:

- lectura de `support_tickets`
- lectura de empresas
- lectura del perfil solicitante
- lectura de `activity_log`
- actualización de ticket
- `close_support_ticket`
- comprobación `current_user_is_worker`

No se inventan RPCs, tablas ni operaciones nuevas.

## Nota

El archivo original no contenía una UI de creación o eliminación de tickets. Aunque la matriz de RBAC contempla `support.create` y `support.delete`, esas operaciones no se han inventado en esta migración; quedan disponibles para una futura ampliación cuando se defina su flujo/backend.
