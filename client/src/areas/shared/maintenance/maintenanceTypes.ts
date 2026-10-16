import type { ReactNode } from "react";

export type Row = Record<string, any>;
export type PermissionCode = "maintenance.read" | "maintenance.create" | "maintenance.update" | "maintenance.delete" | "maintenance_proposals.update" | "invoices.create" | "invoices.update";

export type Contract = Row & {
  id: string; company_id: string; plan_id: string | null; nombre_plan: string | null;
  precio: number | null; moneda: string | null; periodicidad: string | null; estado: string | null;
  fecha_inicio: string | null; fecha_fin: string | null; current_period_start: string | null;
  current_period_end: string | null; renewal_day: number | null; cancel_at_period_end: boolean;
  cancel_requested_at: string | null; cancel_effective_at: string | null; pending_plan_id: string | null;
  pending_change_effective_at: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null;
  stripe_subscription_item_id: string | null; stripe_price_id: string | null; plan_snapshot: Row | null;
  stripe_checkout_session_id?: string | null; contracted_at?: string | null; terms_version?: string | null;
  maintenance_custom_proposal_id?: string | null; agreed_monthly_price?: number | null;
  iva_aplicado?: boolean; iva_porcentaje?: number | null; iva_source?: string | null;
  iva_configured_by?: string | null; iva_configured_at?: string | null; billing_failure_count?: number | null;
  last_payment_failed_at?: string | null; billing_blocked_at?: string | null; billing_block_reason?: string | null;
};

export type Invoice = Row & { id:string; rectifies_invoice_id?:string|null; rectification_reason?:string|null; rectification_customer_data_source?:"original_invoice"|"current_company"|string|null; iva_aplicado?:boolean; irpf_aplicado?:boolean; maintenance_contract_id:string|null; company_id:string|null; serie:string; numero:number; estado:string; fecha_emision:string; fecha_vencimiento:string|null; fecha_pago:string|null; periodo_inicio:string; periodo_fin:string; subtotal:number; iva_porcentaje:number; iva_importe:number; irpf_porcentaje:number; irpf_importe:number; monto:number; importe_a_pagar:number; moneda:string; customer_legal_name:string; customer_tax_id:string; customer_address:string|null; customer_postal_code:string|null; customer_city:string|null; customer_province:string|null; customer_country:string; stripe_invoice_id:string|null; stripe_customer_id:string|null; electronic_document_storage_path:string|null; electronic_document_hash:string|null; pdf_storage_path:string|null; pdf_sha256:string|null; document_path?:string|null; document_mime_type?:string|null; document_file_size?:number|null; document_sha256?:string|null; document_uploaded_at?:string|null; document_uploaded_by?:string|null; stripe_pdf_storage_path?:string|null; stripe_pdf_sha256?:string|null; created_at:string };
export type Company = Row & { id:string; company_name?:string|null; legal_name?:string|null; cif_vat?:string|null; billing_email?:string|null; address?:string|null; postal_code?:string|null; city?:string|null; province?:string|null; country?:string|null };
export type Proposal = Row & { id:string; company_id:string; user_id:string; status:string; titulo:string; quoted_monthly_price:number|null; quoted_currency:string|null; quoted_hours_monthly:number|null; quoted_scope_level:string|null; quoted_service_level:string|null; quoted_sla:string|null; quoted_response_time:string|null; quoted_support_hours:string|null; quoted_description:string|null; quoted_terms:string|null; quoted_valid_until:string|null; maintenance_contract_id:string|null; current_document_id?:string|null; response_notes?:string|null; created_at:string };
export type Relation = { id:string; maintenance_contract_id:string; project_id?:string; automation_id?:string; created_at:string };
export type MaintenanceProjectChangeRequest = Row & { id:string; maintenance_contract_id:string; company_id:string; requested_by:string; current_project_id:string; requested_project_id:string; status:string; requested_at:string; reviewed_at:string|null; reviewed_by:string|null; effective_at:string|null; rejection_reason:string|null };

export type MaintenanceData = {
  contracts: Contract[]; invoices: Invoice[]; companies: Company[]; plans: Row[]; projects: Row[];
  contractProjects: Relation[]; contractAutomations: Relation[]; automations: Row[]; payments: Row[];
  activityLog: Row[]; companyChangeRequests: Row[]; projectChangeRequests: MaintenanceProjectChangeRequest[];
  maintenanceIvaRequests: Row[]; proposals: Proposal[]; proposalDocuments: Row[]; proposalAcks: Row[]; proposalEvents: Row[];
};

export type MaintenancePermissions = {
  canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean; canManageProposals: boolean; canCreateInvoice: boolean; canUpdateInvoice: boolean;
};

export type MaintenanceProps = { basePath?: string; onMenuNavigate?: (id:string)=>void };
export type ActionState = { loadingId: string|null; error: string|null };
export type QuoteState = { monthlyPrice:string; hoursMonthly:string; scopeLevel:string; serviceLevel:string; sla:string; responseTime:string; supportHours:string; description:string; terms:string; validUntil:string };
export type SectionHeaderProps = { eyebrow?:string; title:string; text?:string; action?:ReactNode };
