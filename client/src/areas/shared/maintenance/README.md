# Modira — Maintenance RBAC module

Shared maintenance module for the five-role worker architecture.

## Permissions
- `maintenance.read`: access/read-only visibility.
- `maintenance.create`: retained for role matrix compatibility; no create-contract UI is invented because the supplied worker frontend does not expose a worker contract-creation RPC.
- `maintenance.update`: contract-scoped worker mutations grounded in the existing frontend/backend: maintenance project assignment/removal, contract IVA update, maintenance invoice PDF association.
- `maintenance.delete`: retained for role matrix compatibility; no delete UI is exposed because maintenance contracts/invoices are protected by backend rules and the supplied worker frontend has no valid worker delete operation.
- `maintenance_proposals.update`: review/custom proposal management and proposal document publication.

## Backend operations used
- `worker_assign_maintenance_contract_project`
- `worker_unassign_maintenance_contract_project`
- `update_maintenance_contract_iva`
- `approve_maintenance_contract_project_change`
- `reject_maintenance_contract_project_change`
- `resolve_maintenance_iva_change_request`
- `attach_maintenance_invoice_document`
- Edge Function `maintenance-stripe` actions already used by the supplied worker frontend for maintenance invoice hashing and custom proposal document registration.
- `review_custom_maintenance_proposal`
- `current_worker_has_permission`

No Stripe checkout/reconciliation operation is added to the worker UI.
No worker acceptance of a Custom proposal is added; contractual acceptance remains client-side.
