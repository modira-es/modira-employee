# Companies — RBAC shared module

Shared Companies module without an embedded sidebar/menu.

## Roles
- Direction: full access to the Companies functionality present in the supplied worker module.
- Commercial: Companies read access; no administrative profile reassignment or approval controls are exposed without a confirmed granular permission.
- Accounting / Developer / Support: no Companies module access.

## Preserved functionality
- Company list, search, filters and previous-company detection.
- Full company detail and fiscal information.
- Company IVA recommendation via the existing `set_company_iva_recommendation` RPC.
- Company change request review via the existing `resolve_company_change_request` RPC.
- IVA change request review via the existing `resolve_company_iva_change_request` RPC.
- Users, clients, projects, quotations, invoices/payments, support, maintenance, audits, activity and notifications related to the company.
- No direct UPDATE/INSERT/DELETE against `companies` is invented.
- No client-only company-change RPC is used by workers.
- No sidebar/menu is included.
