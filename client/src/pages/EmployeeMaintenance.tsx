import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  CreditCard,
  ExternalLink,
  FileCheck2,
  FileText,
  FolderKanban,
  Info,
  Loader2,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
  Wrench,
  X,
  Plus,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

/**
 * MODIRA — EmployeeMaintenance.tsx
 *
 * CRM interno de mantenimiento.
 *
 * Arquitectura:
 * - SELECT directo únicamente donde las migraciones lo permiten.
 * - Escrituras sensibles mediante RPC / Edge Function existentes.
 * - maintenance_invoices permanece histórico/inmutable.
 * - Stripe no se implementa en frontend.
 * - Las propuestas Custom se revisan mediante review_custom_maintenance_proposal().
 * - La aceptación contractual de una propuesta Custom la realiza el cliente.
 * - maintenance_contract_projects se modifica únicamente mediante las RPC
 *   worker_assign_maintenance_contract_project / worker_unassign_maintenance_contract_project.
 * - maintenance_contract_automations es lectura: no existe una RPC worker de escritura
 *   en la arquitectura actual.
 */

type Row = Record<string, any>;

type Contract = Row & {
  id: string;
  company_id: string;
  plan_id: string | null;
  nombre_plan: string | null;
  precio: number | null;
  moneda: string | null;
  periodicidad: string | null;
  estado: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  renewal_day: number | null;
  cancel_at_period_end: boolean;
  cancel_requested_at: string | null;
  cancel_effective_at: string | null;
  pending_plan_id: string | null;
  pending_change_effective_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_item_id: string | null;
  stripe_price_id: string | null;
  plan_snapshot: Row | null;
  stripe_checkout_session_id?: string | null;
  contracted_at?: string | null;
  terms_version?: string | null;
  maintenance_custom_proposal_id?: string | null;
  agreed_monthly_price?: number | null;
  iva_aplicado?: boolean;
  iva_porcentaje?: number | null;
  iva_source?: string | null;
  iva_configured_by?: string | null;
  iva_configured_at?: string | null;
  billing_failure_count?: number | null;
  last_payment_failed_at?: string | null;
  billing_blocked_at?: string | null;
  billing_block_reason?: string | null;
};

type Invoice = Row & {
  id: string;
  maintenance_contract_id: string | null;
  company_id: string | null;
  serie: string;
  numero: number;
  estado: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  fecha_pago: string | null;
  periodo_inicio: string;
  periodo_fin: string;
  subtotal: number;
  iva_porcentaje: number;
  iva_importe: number;
  irpf_porcentaje: number;
  irpf_importe: number;
  monto: number;
  importe_a_pagar: number;
  moneda: string;
  customer_legal_name: string;
  customer_tax_id: string;
  customer_address: string | null;
  customer_postal_code: string | null;
  customer_city: string | null;
  customer_province: string | null;
  customer_country: string;
  stripe_invoice_id: string | null;
  stripe_customer_id: string | null;
  electronic_document_storage_path: string | null;
  electronic_document_hash: string | null;
  pdf_storage_path: string | null;
  pdf_sha256: string | null;
  document_path?: string | null;
  document_mime_type?: string | null;
  document_file_size?: number | null;
  document_sha256?: string | null;
  document_uploaded_at?: string | null;
  document_uploaded_by?: string | null;
  stripe_pdf_storage_path?: string | null;
  stripe_pdf_sha256?: string | null;
  created_at: string;
};

type Company = Row & {
  id: string;
  company_name?: string | null;
  legal_name?: string | null;
  cif_vat?: string | null;
  billing_email?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
};

type Proposal = Row & {
  id: string;
  company_id: string;
  user_id: string;
  status: string;
  titulo: string;
  quoted_monthly_price: number | null;
  quoted_currency: string | null;
  quoted_hours_monthly: number | null;
  quoted_scope_level: string | null;
  quoted_service_level: string | null;
  quoted_sla: string | null;
  quoted_response_time: string | null;
  quoted_support_hours: string | null;
  quoted_description: string | null;
  quoted_terms: string | null;
  quoted_valid_until: string | null;
  maintenance_contract_id: string | null;
  current_document_id?: string | null;
  response_notes?: string | null;
  created_at: string;
  [key: string]: any;
};

type Relation = {
  id: string;
  maintenance_contract_id: string;
  project_id?: string;
  automation_id?: string;
  created_at: string;
};

type MaintenanceProjectChangeRequest = Row & {
  id: string;
  maintenance_contract_id: string;
  company_id: string;
  requested_by: string;
  current_project_id: string;
  requested_project_id: string;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  effective_at: string | null;
  rejection_reason: string | null;
};

type Props = {
  basePath?: string;
  onMenuNavigate?: (id: string) => void;
};

const EDGE = "maintenance-stripe";
const INVOICE_BUCKET = "maintenance-invoices";
const PROPOSAL_BUCKET = "maintenance-proposals";

function norm(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function money(v: unknown, currency = "EUR") {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

function fmtDate(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-ES");
}

function fmtDateTime(v: unknown) {
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-ES");
}

function companyLabel(c?: Company | null) {
  return c?.legal_name || c?.company_name || c?.name || "Empresa sin identificar";
}

function statusLabel(v: unknown) {
  const s = norm(v);
  const labels: Record<string, string> = {
    activo: "Activo",
    pausado: "Pausado",
    cancelado: "Cancelado",
    pendiente: "Pendiente",
    pagada: "Pagada",
    enviada: "Enviada",
    impagada: "Impagada",
    anulada: "Anulada",
    rectificada: "Rectificada",
    borrador: "Borrador",
    submitted: "Pendiente",
    in_review: "En revisión",
    clarification_requested: "Esperando información",
    quoted: "Propuesta enviada",
    accepted: "Aceptada",
    rejected: "Rechazada",
    cancelled: "Cancelada",
    expired: "Caducada",
    active: "Activo",
    paused: "Pausado",
    failed: "Fallido",
    succeeded: "Pagado",
    paid: "Pagado",
  };
  return labels[s] || String(v || "—");
}

function statusClass(v: unknown) {
  const s = norm(v);
  if (["activo", "pagada", "succeeded", "paid", "accepted"].includes(s))
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (["pendiente", "enviada", "submitted", "in_review", "quoted", "paused", "pausado"].includes(s))
    return "border-amber-200 bg-amber-50 text-amber-700";
  if (["impagada", "failed", "rejected", "cancelado", "cancelled", "anulada", "expired"].includes(s))
    return "border-red-200 bg-red-50 text-red-700";
  if (["clarification_requested"].includes(s))
    return "border-purple-200 bg-purple-50 text-purple-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: ReactNode;
}) {
  return (
    <div className="border border-slate-200 bg-white px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
          {detail && <p className="mt-1 text-[11px] text-slate-400">{detail}</p>}
        </div>
        <div className="text-[#102A66]">{icon}</div>
      </div>
    </div>
  );
}

function Empty({ title, text, icon }: { title: string; text: string; icon: ReactNode }) {
  return (
    <div className="border border-dashed border-slate-300 bg-slate-50/50 px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center text-slate-400">{icon}</div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#102A66]">{eyebrow}</p>}
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
        {text && <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{text}</p>}
      </div>
      {action}
    </div>
  );
}

export default function EmployeeMaintenance({
  basePath = "/employee/maintenance",
  onMenuNavigate,
}: Props) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();

  const employeeRoot = basePath.replace(/\/maintenance\/?$/, "") || "/employee";
  const escapedBasePath = basePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const contractMatch = location.match(new RegExp(`^${escapedBasePath}/contract/([^/]+)$`));
  const proposalMatch = location.match(new RegExp(`^${escapedBasePath}/proposal/([^/]+)$`));
  const planMatch = location.match(new RegExp(`^${escapedBasePath}/plan/([^/]+)$`));
  const contractFromUrl = contractMatch?.[1] || planMatch?.[1] || null;
  const proposalFromUrl = proposalMatch?.[1] || null;

  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<"maintenance" | "billing" | "stripe" | "proposals">("maintenance");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [contractProjects, setContractProjects] = useState<Relation[]>([]);
  const [contractAutomations, setContractAutomations] = useState<Relation[]>([]);
  const [automations, setAutomations] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [activityLog, setActivityLog] = useState<Row[]>([]);
  const [companyChangeRequests, setCompanyChangeRequests] = useState<Row[]>([]);
  const [projectChangeRequests, setProjectChangeRequests] = useState<MaintenanceProjectChangeRequest[]>([]);
  const [projectChangeRejectingId, setProjectChangeRejectingId] = useState<string | null>(null);
  const [projectChangeRejectionReason, setProjectChangeRejectionReason] = useState("");
  const [projectChangeActionLoading, setProjectChangeActionLoading] = useState<string | null>(null);
  const [maintenanceIvaRequests, setMaintenanceIvaRequests] = useState<Row[]>([]);
const [maintenanceIvaActionLoading, setMaintenanceIvaActionLoading] =
  useState<string | null>(null);
const [maintenanceIvaRejectingId, setMaintenanceIvaRejectingId] =
  useState<string | null>(null);
const [maintenanceIvaRejectionReason, setMaintenanceIvaRejectionReason] =
  useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalDocuments, setProposalDocuments] = useState<Row[]>([]);
  const [proposalAcks, setProposalAcks] = useState<Row[]>([]);
  const [proposalEvents, setProposalEvents] = useState<Row[]>([]);

  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState("all");
  const [invoiceDocumentFilter, setInvoiceDocumentFilter] = useState("all");
  const [stripeFilter, setStripeFilter] = useState("all");
  const [proposalFilter, setProposalFilter] = useState("all");
  const [proposalSearch, setProposalSearch] = useState("");

  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [proposalAction, setProposalAction] = useState<"in_review" | "quoted" | "clarification_requested" | "rejected">("in_review");
  const [proposalActionLoading, setProposalActionLoading] = useState(false);
  const [proposalPdfLoading, setProposalPdfLoading] = useState<string | null>(null);
  const [proposalPdfOpening, setProposalPdfOpening] = useState<string | null>(null);
  const [clarificationMessage, setClarificationMessage] = useState("");
  const [responseNotes, setResponseNotes] = useState("");
  const [quote, setQuote] = useState({
    monthlyPrice: "",
    hoursMonthly: "",
    scopeLevel: "",
    serviceLevel: "",
    sla: "",
    responseTime: "",
    supportHours: "",
    description: "",
    terms: "",
    validUntil: "",
    
  });

  const [projectToAssign, setProjectToAssign] = useState("");
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectRemoving, setProjectRemoving] = useState<string | null>(null);


  const go = useCallback((path: string) => {
    setMenuOpen(false);
    setLocation(path);
  }, [setLocation]);

  const menuNavigate = useCallback((id: string) => {
    setMenuOpen(false);
    if (onMenuNavigate) {
      onMenuNavigate(id);
      return;
    }
    const routes: Record<string, string> = {
      dashboard: employeeRoot,
      projects: `${employeeRoot}/projects`,
      companies: `${employeeRoot}/companies`,
      quotations: `${employeeRoot}/quotations`,
      billing: `${employeeRoot}/billing`,
      payments: `${employeeRoot}/payments`,
      support: `${employeeRoot}/support`,
      ai: `${employeeRoot}/ai`,
      notifications: `${employeeRoot}/notifications`,
      activity: `${employeeRoot}/activity`,
      audits: `${employeeRoot}/audits`,
      companyChanges: `${employeeRoot}/companyChanges`,
      maintenance: basePath,
    };
    if (routes[id]) go(routes[id]);
  }, [basePath, employeeRoot, go, onMenuNavigate]);

  const load = useCallback(async (silent = false) => {
    if (!user) return;

    setError(null);
    silent ? setRefreshing(true) : setLoading(true);

    try {
      const results = await Promise.all([
        supabase.from("maintenance_contracts").select("*").order("created_at", { ascending: false }),
        supabase.from("maintenance_invoices").select("*").order("fecha_emision", { ascending: false }),
        supabase.from("companies").select("*").order("company_name", { ascending: true }),
        supabase.from("maintenance_plans").select("*").order("precio", { ascending: true, nullsFirst: false }),
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("maintenance_contract_projects").select("*").order("created_at", { ascending: false }),
        supabase.from("maintenance_contract_automations").select("*").order("created_at", { ascending: false }),
        supabase.from("automations").select("*").order("created_at", { ascending: false }),
        supabase.from("payments").select("*").not("maintenance_invoice_id", "is", null).order("created_at", { ascending: false }),
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(1000),
        supabase.from("company_change_requests").select("*").order("created_at", { ascending: false }).limit(500),
        supabase.from("maintenance_contract_project_change_requests").select("*").order("requested_at", { ascending: false }).limit(500),
        supabase.from("maintenance_custom_proposals").select("*").order("created_at", { ascending: false }),
        supabase.from("maintenance_custom_proposal_documents").select("*").order("created_at", { ascending: false }),
        supabase.from("maintenance_custom_proposal_document_acknowledgements").select("*").order("accepted_at", { ascending: false }),
        supabase.from("maintenance_custom_proposal_events").select("*").order("created_at", { ascending: false }),
        supabase
  .from("maintenance_iva_change_requests")
  .select("*")
  .order("created_at", { ascending: false }),
      ]);

      const hard = results.slice(0, 9).find((r) => r.error);
      if (hard?.error) throw hard.error;
      if (results[11].error) throw results[11].error;

      setContracts((results[0].data || []) as Contract[]);
      setInvoices((results[1].data || []) as Invoice[]);
      setCompanies((results[2].data || []) as Company[]);
      setPlans(results[3].data || []);
      setProjects(results[4].data || []);
      setContractProjects(results[5].data || []);
      setContractAutomations(results[6].data || []);
      setAutomations(results[7].data || []);
      setPayments(results[8].data || []);
      setActivityLog(results[9].error ? [] : (results[9].data || []));
      setCompanyChangeRequests(results[10].error ? [] : (results[10].data || []));
      setProjectChangeRequests(results[11].error ? [] : ((results[11].data || []) as MaintenanceProjectChangeRequest[]));

      setProposals(results[12].error ? [] : ((results[12].data || []) as Proposal[]));
      setProposalDocuments(results[13].error ? [] : (results[13].data || []));
      setProposalAcks(results[14].error ? [] : (results[14].data || []));
      setProposalEvents(results[15].error ? [] : (results[15].data || []));
      setMaintenanceIvaRequests(
  results[16].error ? [] : (results[16].data || [])
);
    } catch (e: any) {
      console.error("[EmployeeMaintenance] load", e);
      setError(e?.message || "No se ha podido cargar el área de mantenimiento.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const planMap = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const automationMap = useMemo(() => new Map(automations.map((a) => [a.id, a])), [automations]);

  const contractProjectMap = useMemo(() => {
    const m = new Map<string, Relation[]>();
    contractProjects.forEach((r) => {
      const list = m.get(r.maintenance_contract_id) || [];
      list.push(r);
      m.set(r.maintenance_contract_id, list);
    });
    return m;
  }, [contractProjects]);

  const contractAutomationMap = useMemo(() => {
    const m = new Map<string, Relation[]>();
    contractAutomations.forEach((r) => {
      const list = m.get(r.maintenance_contract_id) || [];
      list.push(r);
      m.set(r.maintenance_contract_id, list);
    });
    return m;
  }, [contractAutomations]);

  const selectedContract = contractFromUrl
    ? contracts.find((c) => c.id === contractFromUrl) || null
    : null;

  const activeContracts = useMemo(
    () => contracts.filter((c) => ["activo", "pausado"].includes(norm(c.estado))),
    [contracts]
  );

  const currentMonthRevenue = useMemo(() => {
    const now = new Date();
    return invoices
      .filter((i) => {
        const d = new Date(i.fecha_emision);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((s, i) => s + Number(i.importe_a_pagar ?? i.monto ?? 0), 0);
  }, [invoices]);

  const pendingInvoiceCount = useMemo(
    () => invoices.filter((i) => ["pendiente", "enviada", "impagada"].includes(norm(i.estado))).length,
    [invoices]
  );

  const cancellationPending = useMemo(
    () => contracts.filter((c) => c.cancel_at_period_end && norm(c.estado) !== "cancelado").length,
    [contracts]
  );

  const proposalPending = useMemo(
    () => proposals.filter((p) => ["submitted", "in_review", "clarification_requested"].includes(norm(p.status))).length,
    [proposals]
  );

  const billingIncidents = useMemo(
    () =>
      contracts.filter(
        (c) =>
          Number(c.billing_failure_count || 0) > 0 ||
          Boolean(c.billing_blocked_at)
      ).length,
    [contracts]
  );

  const fiscalIncomplete = useMemo(
    () =>
      companies.filter((c) =>
        contracts.some((x) => x.company_id === c.id) &&
        !(
          Boolean((c.legal_name || c.company_name)?.trim()) &&
          Boolean(c.cif_vat?.trim()) &&
          Boolean(c.address?.trim()) &&
          Boolean(c.postal_code?.trim()) &&
          Boolean(c.city?.trim()) &&
          Boolean(c.country?.trim())
        )
      ).length,
    [companies, contracts]
  );

  const pendingFiscalChangeCount = useMemo(
    () => companyChangeRequests.filter((r) => norm(r.status) === "pending").length,
    [companyChangeRequests]
  );

  const pendingProjectChangeCount = useMemo(
    () => projectChangeRequests.filter((r) => norm(r.status) === "pending").length,
    [projectChangeRequests]
  );

  const documentPending = useMemo(
    () =>
      invoices.filter(
        (i) =>
          !i.document_path &&
          !i.pdf_storage_path &&
          !i.electronic_document_storage_path
      ).length,
    [invoices]
  );

  const filteredContracts = useMemo(() => {
    const q = norm(search);
    return contracts.filter((c) => {
      const company = companyMap.get(c.company_id);
      const plan = c.plan_id ? planMap.get(c.plan_id) : null;
      const hay = [
        c.id,
        companyLabel(company),
        c.nombre_plan,
        plan?.nombre,
        plan?.code,
        c.stripe_subscription_id,
        c.estado,
      ].map(norm).join(" ");

      const companyOk = companyFilter === "all" || c.company_id === companyFilter;
      const planOk = planFilter === "all" || c.plan_id === planFilter;
      const statusOk = statusFilter === "all" || norm(c.estado) === norm(statusFilter);

      return companyOk && planOk && statusOk && (!q || hay.includes(q));
    });
  }, [companyMap, companyFilter, contracts, planFilter, planMap, search, statusFilter]);

  const filteredInvoices = useMemo(() => {
    const q = norm(search);
    return invoices.filter((i) => {
      const company = i.company_id ? companyMap.get(i.company_id) : null;
      const hasModira = Boolean(i.document_path || i.pdf_storage_path || i.electronic_document_storage_path);
      const hasStripe = Boolean(i.stripe_pdf_storage_path);
      const hay = [
        i.id,
        `${i.serie}-${i.numero}`,
        companyLabel(company),
        i.customer_legal_name,
        i.customer_tax_id,
        i.estado,
        i.stripe_invoice_id,
      ].map(norm).join(" ");

      const statusOk = invoiceStatusFilter === "all" || norm(i.estado) === norm(invoiceStatusFilter);
      const docOk =
        invoiceDocumentFilter === "all" ||
        (invoiceDocumentFilter === "modira" && hasModira) ||
        (invoiceDocumentFilter === "stripe" && hasStripe) ||
        (invoiceDocumentFilter === "both" && hasModira && hasStripe) ||
        (invoiceDocumentFilter === "none" && !hasModira && !hasStripe);

      return statusOk && docOk && (!q || hay.includes(q));
    });
  }, [companyMap, invoiceDocumentFilter, invoiceStatusFilter, invoices, search]);

  const stripeRows = useMemo(() => {
    return invoices
      .filter((i) => i.stripe_invoice_id || i.stripe_customer_id)
      .map((i) => {
        const payment = payments.find((p) => p.maintenance_invoice_id === i.id);
        const contract = contracts.find((c) => c.id === i.maintenance_contract_id);
        return { invoice: i, payment, contract };
      });
  }, [contracts, invoices, payments]);

  const filteredStripeRows = useMemo(() => {
    const q = norm(search);
    return stripeRows.filter(({ invoice, contract, payment }) => {
      const status = norm(payment?.status || payment?.estado || invoice.estado);
      const statusOk = stripeFilter === "all" || status === norm(stripeFilter);
      const hay = [
        invoice.stripe_invoice_id,
        invoice.customer_legal_name,
        contract?.stripe_subscription_id,
        contract?.stripe_customer_id,
        status,
      ].map(norm).join(" ");
      return statusOk && (!q || hay.includes(q));
    });
  }, [search, stripeFilter, stripeRows]);

  const filteredProposals = useMemo(() => {
    const q = norm(proposalSearch);
    return proposals.filter((p) => {
      const company = companyMap.get(p.company_id);
      const statusOk = proposalFilter === "all" || norm(p.status) === norm(proposalFilter);
      const hay = [p.titulo, companyLabel(company), p.status, p.id].map(norm).join(" ");
      return statusOk && (!q || hay.includes(q));
    });
  }, [companyMap, proposalFilter, proposalSearch, proposals]);

  const openContract = (id: string) => {
    setLocation(`${basePath}/contract/${id}`);
  };

  const openProposal = (id: string) => {
    setLocation(`${basePath}/proposal/${id}`);
  };

  const backToList = () => {
    setLocation(basePath);
  };

  const openDocument = async (path: string, bucket: string) => {
    try {
      const { data, error: e } = await supabase.storage.from(bucket).createSignedUrl(path, 600);
      if (e) throw e;
      if (!data?.signedUrl) throw new Error("No se ha podido generar el enlace seguro.");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message || "No se ha podido abrir el documento.");
    }
  };

  const uploadInvoicePdf = async (invoice: Invoice, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Solo se permiten PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("El PDF no puede superar 10 MiB.");
      return;
    }
    if (invoice.document_path) {
      toast.error("La factura ya tiene un documento Modira asociado.");
      return;
    }

    try {
      const path = `${invoice.id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage.from(INVOICE_BUCKET).upload(path, file, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: attachError } = await supabase.rpc("attach_maintenance_invoice_document", {
        p_invoice_id: invoice.id,
        p_document_path: path,
      });
      if (attachError) throw attachError;

      toast.success("PDF asociado a la factura.");
      await load(true);

      const { error: hashError } = await supabase.functions.invoke(EDGE, {
        body: { action: "hash_maintenance_invoice_document", invoice_id: invoice.id },
      });
      if (hashError) {
        console.error("[EmployeeMaintenance] hash", hashError);
        toast.warning("El PDF se ha asociado, pero no se pudo completar ahora la validación SHA-256.");
      } else {
        toast.success("SHA-256 del documento registrado.");
        await load(true);
      }
    } catch (e: any) {
      console.error("[EmployeeMaintenance] upload invoice", e);
      toast.error(e?.message || "No se ha podido asociar el PDF.");
      await load(true);
    }
  };

  const assignProject = async () => {
    if (!selectedContract || !projectToAssign) return;
    try {
      setProjectLoading(true);
      const { error: e } = await supabase.rpc("worker_assign_maintenance_contract_project", {
        p_contract_id: selectedContract.id,
        p_project_id: projectToAssign,
      });
      if (e) throw e;
      setProjectToAssign("");
      toast.success("Proyecto asociado.");
      await load(true);
    } catch (e: any) {
      toast.error(e?.message || "No se ha podido asociar el proyecto.");
    } finally {
      setProjectLoading(false);
    }
  };

  const removeProject = async (relation: Relation) => {
    if (!selectedContract || !relation.project_id) return;
    try {
      setProjectRemoving(relation.id);
      const { error: e } = await supabase.rpc("worker_unassign_maintenance_contract_project", {
        p_contract_id: selectedContract.id,
        p_project_id: relation.project_id,
      });
      if (e) throw e;
      toast.success("Proyecto desasociado.");
      await load(true);
    } catch (e: any) {
      toast.error(e?.message || "No se ha podido desasociar el proyecto.");
    } finally {
      setProjectRemoving(null);
    }
  };

  const changeProject = async (relation: Relation) => {
    if (!selectedContract || !relation.project_id || !projectToAssign || projectToAssign === relation.project_id) return;
    const previousProjectId = relation.project_id;
    try {
      setProjectLoading(true);
      const { error: removeError } = await supabase.rpc("worker_unassign_maintenance_contract_project", {
        p_contract_id: selectedContract.id,
        p_project_id: previousProjectId,
      });
      if (removeError) throw removeError;

      const { error: assignError } = await supabase.rpc("worker_assign_maintenance_contract_project", {
        p_contract_id: selectedContract.id,
        p_project_id: projectToAssign,
      });

      if (assignError) {
        // Intento de recuperación: si la nueva asociación falla, restauramos la anterior.
        await supabase.rpc("worker_assign_maintenance_contract_project", {
          p_contract_id: selectedContract.id,
          p_project_id: previousProjectId,
        });
        throw assignError;
      }

      setProjectToAssign("");
      toast.success("Proyecto del mantenimiento cambiado.");
      await load(true);
    } catch (e: any) {
      toast.error(e?.message || "No se ha podido cambiar el proyecto del mantenimiento.");
      await load(true);
    } finally {
      setProjectLoading(false);
    }
  };

  const projectChangeProjectName = useCallback((projectId: string | null | undefined) => {
    if (!projectId) return "—";
    const project = projectMap.get(projectId);
    return project?.nombre || project?.name || project?.titulo || projectId;
  }, [projectMap]);
const resolveMaintenanceIvaRequest = async (
  requestId: string,
  action: "approved" | "rejected"
) => {
  try {
    setMaintenanceIvaActionLoading(requestId);

    const { error: e } = await supabase.rpc(
      "resolve_maintenance_iva_change_request",
      {
        p_request_id: requestId,
        p_action: action,
        p_worker_notes:
          action === "rejected"
            ? maintenanceIvaRejectionReason.trim() || null
            : null,
      }
    );

    if (e) throw e;

    toast.success(
      action === "approved"
        ? "Solicitud de cambio de IVA aprobada."
        : "Solicitud de cambio de IVA rechazada."
    );

    setMaintenanceIvaRejectingId(null);
    setMaintenanceIvaRejectionReason("");

    await load(true);
  } catch (e: any) {
    console.error("[EmployeeMaintenance] resolve IVA request", e);
    toast.error(
      e?.message || "No se ha podido gestionar la solicitud de IVA."
    );
  } finally {
    setMaintenanceIvaActionLoading(null);
  }
};
  const approveProjectChange = async (requestId: string) => {
    try {
      setProjectChangeActionLoading(requestId);
      const { error: e } = await supabase.rpc("approve_maintenance_contract_project_change", {
        p_request_id: requestId,
      });
      if (e) throw e;
      toast.success("Solicitud de cambio de proyecto aprobada.");
      await load(true);
    } catch (e: any) {
      console.error("[EmployeeMaintenance] approve project change", e);
      toast.error(e?.message || "No se ha podido aprobar la solicitud.");
    } finally {
      setProjectChangeActionLoading(null);
    }
  };

  const rejectProjectChange = async () => {
    if (!projectChangeRejectingId) return;
    const reason = projectChangeRejectionReason.trim();
    if (!reason) {
      toast.error("Indica el motivo del rechazo.");
      return;
    }

    try {
      setProjectChangeActionLoading(projectChangeRejectingId);
      const { error: e } = await supabase.rpc("reject_maintenance_contract_project_change", {
        p_request_id: projectChangeRejectingId,
        p_reason: reason,
      });
      if (e) throw e;
      toast.success("Solicitud de cambio de proyecto rechazada.");
      setProjectChangeRejectingId(null);
      setProjectChangeRejectionReason("");
      await load(true);
    } catch (e: any) {
      console.error("[EmployeeMaintenance] reject project change", e);
      toast.error(e?.message || "No se ha podido rechazar la solicitud.");
    } finally {
      setProjectChangeActionLoading(null);
    }
  };
const updateMaintenanceContractIva = async (
  contractId: string,
  ivaAplicado: boolean,
  ivaPorcentaje: number
) => {
  try {
    if (
      ivaAplicado &&
      (!Number.isFinite(ivaPorcentaje) ||
        ivaPorcentaje < 0 ||
        ivaPorcentaje > 100)
    ) {
      toast.error("Introduce un porcentaje de IVA válido entre 0 y 100.");
      return;
    }

    setMaintenanceIvaActionLoading(contractId);

    const { error: e } = await supabase.rpc(
      "update_maintenance_contract_iva",
      {
        p_contract_id: contractId,
        p_iva_aplicado: ivaAplicado,
        p_iva_porcentaje: ivaAplicado ? ivaPorcentaje : 0,
      }
    );

    if (e) throw e;

    toast.success("IVA del contrato actualizado.");

    await load(true);
  } catch (e: any) {
    console.error("[EmployeeMaintenance] update contract IVA", e);
    toast.error(
      e?.message || "No se ha podido actualizar el IVA del contrato."
    );
  } finally {
    setMaintenanceIvaActionLoading(null);
  }
};
  const selectedProposal = (proposalFromUrl || selectedProposalId)
    ? proposals.find((p) => p.id === (proposalFromUrl || selectedProposalId)) || null
    : null;

  const selectedProposalRouteId = proposalFromUrl || selectedProposalId;

  const selectedProposalDocs = useMemo(
    () =>
      proposalDocuments
        .filter((d) => d.proposal_id === selectedProposalRouteId)
        .sort((a, b) => Number(b.version || 0) - Number(a.version || 0)),
    [proposalDocuments, selectedProposalRouteId]
  );

  const selectedProposalEvents = useMemo(
    () =>
      proposalEvents
        .filter((e) => e.proposal_id === selectedProposalRouteId)
        .sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        ),
    [proposalEvents, selectedProposalRouteId]
  );

  const reviewProposal = async () => {
    if (!selectedProposal) return;

    const currentDoc = selectedProposalDocs.find(
      (d) => d.id === selectedProposal.current_document_id
    );

    if (proposalAction === "quoted") {
      if (!quote.monthlyPrice || Number(quote.monthlyPrice) <= 0) {
        toast.error("Indica un precio mensual válido.");
        return;
      }
      if (!quote.validUntil) {
        toast.error("Indica la fecha de validez.");
        return;
      }
      if (!currentDoc) {
        toast.error("Debes publicar primero el PDF de la propuesta.");
        return;
      }
    }

    if (proposalAction === "clarification_requested" && !clarificationMessage.trim()) {
      toast.error("Indica qué información falta.");
      return;
    }

    if (proposalAction === "rejected" && !responseNotes.trim()) {
      toast.error("Indica el motivo del rechazo.");
      return;
    }

    try {
      setProposalActionLoading(true);

      const { error: e } = await supabase.rpc("review_custom_maintenance_proposal", {
        p_proposal_id: selectedProposal.id,
        p_action: proposalAction,
        p_quoted_monthly_price: proposalAction === "quoted" ? Number(quote.monthlyPrice) : null,
        p_quoted_currency: proposalAction === "quoted" ? (selectedProposal.quoted_currency || "EUR") : "EUR",
        p_quoted_hours_monthly: proposalAction === "quoted" && quote.hoursMonthly ? Number(quote.hoursMonthly) : null,
        p_quoted_scope_level: proposalAction === "quoted" ? quote.scopeLevel || null : null,
        p_quoted_service_level: proposalAction === "quoted" ? quote.serviceLevel || null : null,
        p_quoted_sla: proposalAction === "quoted" ? quote.sla || null : null,
        p_quoted_response_time: proposalAction === "quoted" ? quote.responseTime || null : null,
        p_quoted_support_hours: proposalAction === "quoted" ? quote.supportHours || null : null,
        p_quoted_description: proposalAction === "quoted" ? quote.description || null : null,
        p_quoted_terms: proposalAction === "quoted" ? quote.terms || null : null,
        p_quoted_valid_until: proposalAction === "quoted" ? quote.validUntil : null,
        p_response_notes: responseNotes.trim() || null,
        p_clarification_message:
          proposalAction === "clarification_requested"
            ? clarificationMessage.trim()
            : null,
      });

      if (e) throw e;

      toast.success(
        proposalAction === "quoted"
          ? "Propuesta cotizada y enviada."
          : proposalAction === "clarification_requested"
            ? "Solicitud de información enviada."
            : proposalAction === "rejected"
              ? "Propuesta rechazada."
              : "Propuesta puesta en revisión."
      );

      setSelectedProposalId(null);
      await load(true);
    } catch (e: any) {
      console.error("[EmployeeMaintenance] review proposal", e);
      toast.error(e?.message || "No se ha podido actualizar la propuesta.");
    } finally {
      setProposalActionLoading(false);
    }
  };

  const uploadProposalPdf = async (
    proposal: Proposal,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Solo se permiten PDF.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("El PDF no puede superar 20 MiB.");
      return;
    }

    if (!["submitted", "in_review", "clarification_requested"].includes(norm(proposal.status))) {
      toast.error("Esta propuesta no admite una nueva respuesta documental en su estado actual.");
      return;
    }

    try {
      setProposalPdfLoading(proposal.id);

      const path = `${proposal.id}/${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage.from(PROPOSAL_BUCKET).upload(path, file, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data, error: invokeError } = await supabase.functions.invoke(EDGE, {
        body: {
          action: "attach_maintenance_custom_proposal_document",
          proposal_id: proposal.id,
          document_path: path,
        },
      });

      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error || "No se ha podido registrar el PDF.");

      toast.success(`PDF registrado como versión ${data.document?.version || "nueva"}.`);
      await load(true);
    } catch (e: any) {
      console.error("[EmployeeMaintenance] proposal PDF", e);
      toast.error(e?.message || "No se ha podido registrar el PDF.");
      await load(true);
    } finally {
      setProposalPdfLoading(null);
    }
  };

  const openProposalDocument = async (document: Row) => {
    setProposalPdfOpening(document.id);
    try {
      await openDocument(document.document_path, PROPOSAL_BUCKET);
    } finally {
      setProposalPdfOpening(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f8fb] flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-[#102A66]" />
          Cargando CRM de mantenimiento…
        </div>
      </div>
    );
  }

  if (contractFromUrl && !selectedContract) {
    return (
      <div className="min-h-screen bg-[#f7f8fb]">
        <main className="mx-auto max-w-[1500px] px-5 py-10 lg:px-8">
          <button onClick={backToList} className="mb-6 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Volver a Mantenimiento
          </button>
          <Empty
            icon={<Wrench className="h-5 w-5" />}
            title="Contrato no encontrado"
            text="El contrato indicado no está disponible para este worker o ha dejado de existir."
          />
        </main>
      </div>
    );
  }

  if (proposalFromUrl) {
    if (!selectedProposal) {
      return (
        <div className="min-h-screen bg-[#f7f8fb]">
          <main className="mx-auto max-w-[1500px] px-5 py-10 lg:px-8">
            <button onClick={backToList} className="mb-6 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" />
              Volver a Mantenimiento
            </button>
            <Empty icon={<Sparkles className="h-5 w-5" />} title="Propuesta no encontrada" text="La propuesta indicada no está disponible para este worker o ha dejado de existir." />
          </main>
        </div>
      );
    }

    const proposalCompany = companyMap.get(selectedProposal.company_id);
    const proposalContract = selectedProposal.maintenance_contract_id
      ? contracts.find((c) => c.id === selectedProposal.maintenance_contract_id)
      : null;
    const proposalStatus = norm(selectedProposal.status);

    return (
      <div className="min-h-screen bg-[#f7f8fb] text-slate-900">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5 lg:px-8">
            <button onClick={backToList} className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-950">
              <ArrowLeft className="h-4 w-4" />
              Mantenimiento
            </button>
            <Badge className={statusClass(selectedProposal.status)}>{statusLabel(selectedProposal.status)}</Badge>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8 lg:py-9">
          <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#102A66]">CRM · Propuesta personalizada</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{selectedProposal.titulo || "Solicitud personalizada"}</h1>
              <p className="mt-1 text-sm text-slate-500">{companyLabel(proposalCompany)} · creada {fmtDateTime(selectedProposal.created_at)}</p>
            </div>
            <div className="flex gap-2">
              {proposalContract && (
                <button onClick={() => openContract(proposalContract.id)} className="inline-flex h-9 items-center gap-2 border border-slate-200 bg-white px-3 text-xs font-medium hover:bg-slate-50">
                  <Wrench className="h-3.5 w-3.5" /> Abrir contrato
                </button>
              )}
              <button onClick={() => void load(true)} disabled={refreshing} className="inline-flex h-9 items-center gap-2 border border-slate-200 bg-white px-3 text-xs font-medium hover:bg-slate-50 disabled:opacity-60">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Actualizar
              </button>
            </div>
          </div>

          <div className="grid gap-4 border-y border-slate-200 bg-white py-5 md:grid-cols-4">
            {[
              ["Estado", statusLabel(selectedProposal.status)],
              ["Precio cotizado", selectedProposal.quoted_monthly_price != null ? money(selectedProposal.quoted_monthly_price, selectedProposal.quoted_currency || "EUR") : "Pendiente"],
              ["Horas / mes", selectedProposal.quoted_hours_monthly ?? "—"],
              ["Validez", fmtDate(selectedProposal.quoted_valid_until)],
            ].map(([label, value]) => (
              <div key={label} className="px-1">
                <p className="text-[11px] text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-7 grid gap-7 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-7">
              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold">Datos de la empresa / cliente</h2>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  {[
                    ["Razón social", proposalCompany?.legal_name || proposalCompany?.company_name],
                    ["CIF / VAT", proposalCompany?.cif_vat],
                    ["Email", proposalCompany?.billing_email || proposalCompany?.email],
                    ["Dirección", proposalCompany?.address],
                    ["CP / Ciudad", `${proposalCompany?.postal_code || "—"} ${proposalCompany?.city || ""}`],
                    ["Provincia / País", `${proposalCompany?.province || "—"} / ${proposalCompany?.country || "—"}`],
                  ].map(([label, value]) => (
                    <div key={label} className="border-b border-slate-100 pb-2">
                      <p className="text-[11px] text-slate-400">{label}</p>
                      <p className="mt-1 text-xs font-medium text-slate-800">{value || "—"}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold">Solicitud del cliente</h2>
                  <p className="mt-1 text-[11px] text-slate-500">Información recibida mediante el flujo de propuesta personalizada.</p>
                </div>
                <div className="p-5 space-y-3">
                  {[
                    ["Necesidad", selectedProposal.descripcion_necesidad],
                    ["Objetivos", selectedProposal.objetivos],
                    ["Prioridades", selectedProposal.prioridades],
                    ["Soluciones actuales", selectedProposal.soluciones_actuales],
                    ["Proyectos relacionados", selectedProposal.proyectos_relacionados],
                    ["Automatizaciones actuales", selectedProposal.automatizaciones_actuales],
                    ["Integraciones", selectedProposal.integraciones_actuales],
                    ["Tecnologías", selectedProposal.tecnologias],
                    ["Sistemas críticos", selectedProposal.sistemas_criticos],
                    ["Alcance técnico solicitado", selectedProposal.alcance_tecnico_solicitado],
                    ["Horas mensuales solicitadas", selectedProposal.horas_mensuales_solicitadas],
                    ["Tipo de trabajo", selectedProposal.tipo_trabajo],
                    ["Nivel de soporte", selectedProposal.nivel_soporte_solicitado],
                    ["Tiempo de respuesta", selectedProposal.tiempo_respuesta_deseado],
                    ["Horario de soporte", selectedProposal.horario_soporte],
                    ["Soporte fuera de horario", selectedProposal.soporte_fuera_horario ? "Sí" : null],
                    ["SLA solicitado", selectedProposal.sla_solicitado],
                    ["Nivel de criticidad", selectedProposal.nivel_criticidad],
                    ["Impacto de incidencia", selectedProposal.impacto_incidencia],
                    ["Monitorización", selectedProposal.necesidad_monitorizacion ? "Sí" : null],
                    ["Requisitos de seguridad", selectedProposal.requisitos_seguridad],
                    ["Información adicional", selectedProposal.informacion_adicional],
                  ].filter(([, value]) => value !== null && value !== undefined && String(value).trim()).map(([label, value]) => (
                    <div key={String(label)} className="border-b border-slate-100 pb-3 last:border-0">
                      <p className="text-[11px] text-slate-400">{label}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="border border-slate-200 bg-white">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Documentos de la propuesta</h2>
                    <p className="mt-1 text-[11px] text-slate-500">Versionado documental; el backend registra SHA-256 y publicación.</p>
                  </div>
                  {["submitted", "in_review", "clarification_requested"].includes(proposalStatus) && (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 bg-[#102A66] px-3 py-2 text-[11px] font-medium text-white">
                      {proposalPdfLoading === selectedProposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Adjuntar PDF
                      <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={proposalPdfLoading === selectedProposal.id} onChange={(e) => void uploadProposalPdf(selectedProposal, e)} />
                    </label>
                  )}
                </div>
                <div className="divide-y divide-slate-100">
                  {selectedProposalDocs.map((d) => {
                    const ack = proposalAcks.find((a) => a.proposal_id === selectedProposal.id && a.document_id === d.id);
                    return (
                      <div key={d.id} className="px-5 py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold">Versión {d.version}</span>
                              {d.id === selectedProposal.current_document_id && <Badge className="border-blue-200 bg-blue-50 text-blue-700">Actual</Badge>}
                              {d.published_at && <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Publicada</Badge>}
                              {ack && <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Cliente la ha leído</Badge>}
                            </div>
                            <p className="mt-1 break-all font-mono text-[10px] text-slate-400">{d.document_path}</p>
                            <p className="mt-1 break-all font-mono text-[10px] text-slate-500">SHA-256: {d.document_sha256 || "Pendiente"}</p>
                            <p className="mt-1 text-[10px] text-slate-400">Subido: {fmtDateTime(d.document_uploaded_at)}</p>
                          </div>
                          <button onClick={() => void openProposalDocument(d)} disabled={proposalPdfOpening === d.id} className="inline-flex items-center gap-1.5 border border-slate-200 px-2.5 py-1.5 text-[10px] font-medium hover:bg-slate-50">
                            {proposalPdfOpening === d.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />} Ver PDF
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {selectedProposalDocs.length === 0 && <p className="px-5 py-5 text-xs text-slate-400">No hay documentos todavía.</p>}
                </div>
              </section>

              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold">Historial</h2></div>
                <div className="max-h-[340px] overflow-y-auto">
                  {selectedProposalEvents.map((e) => (
                    <div key={e.id} className="border-b border-slate-100 px-5 py-3">
                      <p className="text-xs font-medium text-slate-800">{e.event_type}</p>
                      <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{e.notes || "Sin detalle."}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{fmtDateTime(e.created_at)} · {e.actor_type}</p>
                    </div>
                  ))}
                  {selectedProposalEvents.length === 0 && <p className="px-5 py-5 text-xs text-slate-400">Sin eventos registrados.</p>}
                </div>
              </section>
            </div>

            <aside className="space-y-7">
              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold">Decisión del worker</h2>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">La aceptación contractual no se realiza aquí; el worker revisa, solicita información, cotiza o rechaza.</p>
                </div>
                <div className="p-5 space-y-4">
                  {proposalStatus === "quoted" || proposalStatus === "accepted" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ["Precio", selectedProposal.quoted_monthly_price != null ? money(selectedProposal.quoted_monthly_price, selectedProposal.quoted_currency || "EUR") : "—"],
                        ["Horas/mes", selectedProposal.quoted_hours_monthly ?? "—"],
                        ["Alcance", selectedProposal.quoted_scope_level || "—"],
                        ["Servicio", selectedProposal.quoted_service_level || "—"],
                        ["SLA", selectedProposal.quoted_sla || "—"],
                        ["Respuesta", selectedProposal.quoted_response_time || "—"],
                        ["Soporte", selectedProposal.quoted_support_hours || "—"],
                        ["Válida hasta", fmtDate(selectedProposal.quoted_valid_until)],
                        
                      ].map(([label, value]) => (
                        <div key={String(label)} className="border-b border-slate-100 pb-2"><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 text-xs font-medium">{String(value)}</p></div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[
                          ["Precio mensual *", "monthlyPrice", "number"],
                          ["Horas/mes", "hoursMonthly", "number"],
                          ["Nivel alcance", "scopeLevel", "text"],
                          ["Nivel servicio", "serviceLevel", "text"],
                          ["SLA", "sla", "text"],
                          ["Tiempo respuesta", "responseTime", "text"],
                          ["Horario soporte", "supportHours", "text"],
                          ["Válida hasta *", "validUntil", "date"],
                          
                        ].map(([label, key, type]) => (
                          
                          <label key={key} className="text-[11px] text-slate-500">{label}<input type={type} value={quote[key as keyof typeof quote]} onChange={(e) => setQuote((q) => ({ ...q, [key]: e.target.value }))} className="mt-1 h-9 w-full border border-slate-200 bg-white px-2.5 text-xs outline-none focus:border-[#102A66]/40" /></label>
                        ))}
                      </div>
                      
                      <label className="block text-[11px] text-slate-500">Descripción de la oferta<textarea value={quote.description} onChange={(e) => setQuote((q) => ({ ...q, description: e.target.value }))} rows={4} className="mt-1 w-full border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-[#102A66]/40" /></label>
                      <label className="block text-[11px] text-slate-500">Condiciones<textarea value={quote.terms} onChange={(e) => setQuote((q) => ({ ...q, terms: e.target.value }))} rows={4} className="mt-1 w-full border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-[#102A66]/40" /></label>
                      <label className="block text-[11px] text-slate-500">Notas de respuesta<textarea value={responseNotes} onChange={(e) => setResponseNotes(e.target.value)} rows={3} className="mt-1 w-full border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-[#102A66]/40" /></label>
                      <select value={proposalAction} onChange={(e) => setProposalAction(e.target.value as typeof proposalAction)} className="h-9 w-full border border-slate-200 bg-white px-2.5 text-xs">
                        <option value="in_review">Poner en revisión</option>
                        <option value="quoted">Enviar propuesta cotizada</option>
                        <option value="clarification_requested">Solicitar información</option>
                        <option value="rejected">Rechazar</option>
                      </select>
                      {proposalAction === "clarification_requested" && <textarea value={clarificationMessage} onChange={(e) => setClarificationMessage(e.target.value)} rows={4} placeholder="Qué información debe aportar el cliente…" className="w-full border border-amber-200 bg-amber-50/40 px-2.5 py-2 text-xs outline-none" />}
                      {proposalAction === "quoted" && <div className="border border-amber-200 bg-amber-50 px-3 py-3 text-[11px] leading-5 text-amber-900">Para cotizar, la propuesta debe tener un PDF publicado y una huella SHA-256 registrada.</div>}
                      <button onClick={() => void reviewProposal()} disabled={proposalActionLoading} className="inline-flex h-9 items-center gap-1.5 bg-[#102A66] px-3 text-xs font-medium text-white disabled:opacity-50">
                        {proposalActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Guardar gestión
                      </button>
                    </>
                  )}
                </div>
              </section>

              {proposalContract && (
                <section className="border border-slate-200 bg-white p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Resultado contractual</p>
                  <p className="mt-2 text-xs text-slate-600">Contrato {proposalContract.id}</p>
                  <button onClick={() => openContract(proposalContract.id)} className="mt-3 inline-flex items-center gap-1.5 border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50">Abrir contrato <ArrowRight className="h-3.5 w-3.5" /></button>
                </section>
              )}
            </aside>
          </div>
        </main>
      </div>
    );
  }

  if (selectedContract) {
    const company = companyMap.get(selectedContract.company_id);
    const plan = selectedContract.plan_id ? planMap.get(selectedContract.plan_id) : null;
    const customProposalId = selectedContract.maintenance_custom_proposal_id || null;
    const projectRelations = contractProjectMap.get(selectedContract.id) || [];
    const automationRelations = contractAutomationMap.get(selectedContract.id) || [];
    const contractInvoices = invoices
      .filter((i) => i.maintenance_contract_id === selectedContract.id)
      .sort((a, b) => new Date(b.fecha_emision).getTime() - new Date(a.fecha_emision).getTime());

    const fiscalComplete =
      Boolean((company?.legal_name || company?.company_name)?.trim()) &&
      Boolean(company?.cif_vat?.trim()) &&
      Boolean(company?.address?.trim()) &&
      Boolean(company?.postal_code?.trim()) &&
      Boolean(company?.city?.trim()) &&
      Boolean(company?.country?.trim());

    return (
      <div className="min-h-screen bg-[#f7f8fb] text-slate-900">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5 lg:px-8">
            <button
              onClick={backToList}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" />
              Mantenimiento
            </button>
            <Badge className={statusClass(selectedContract.estado)}>
              {statusLabel(selectedContract.estado)}
            </Badge>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8 lg:py-9">
          <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#102A66]">CRM · Plan de mantenimiento</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
                {companyLabel(company)}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {plan?.nombre || selectedContract.nombre_plan || "Plan"} ·{" "}
                {money(selectedContract.agreed_monthly_price ?? selectedContract.precio, selectedContract.moneda || "EUR")}/mes
              </p>
            </div>

            <button
              onClick={() => void load(true)}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-2 border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>

          <div className="grid gap-4 border-y border-slate-200 bg-white py-5 md:grid-cols-3 xl:grid-cols-6">
            {[
              ["Plan", plan?.nombre || selectedContract.nombre_plan || "—"],
              ["Contratación", fmtDate(selectedContract.contracted_at || selectedContract.fecha_inicio)],
              ["Periodo actual", `${fmtDate(selectedContract.current_period_start)} → ${fmtDate(selectedContract.current_period_end)}`],
              ["Renovación", selectedContract.cancel_at_period_end ? "Cancelación programada" : fmtDate(selectedContract.current_period_end)],
              ["Contrato", statusLabel(selectedContract.estado)],
              ["Precio", money(selectedContract.agreed_monthly_price ?? selectedContract.precio, selectedContract.moneda || "EUR")],
            ].map(([label, value]) => (
              <div key={label} className="px-1">
                <p className="text-[11px] text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {selectedContract.cancel_at_period_end && (
            <div className="mt-5 border border-amber-200 bg-amber-50 px-5 py-4">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                <div>
                  <p className="text-sm font-semibold text-amber-950">Cancelación pendiente</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900/80">
                    Solicitada: {fmtDateTime(selectedContract.cancel_requested_at)} ·
                    Finaliza: {fmtDate(selectedContract.cancel_effective_at)}.
                  </p>
                  <p className="mt-1 text-xs text-amber-900/80">
                    El estado y la fecha efectiva proceden del contrato sincronizado con Stripe.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-7 grid gap-7 xl:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-7">
              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">Estado operativo del plan</h2>
                </div>
                <div className="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">
                  <div className="p-5">
                    <p className="text-[11px] text-slate-400">Contrato</p>
                    <Badge className={`mt-2 ${statusClass(selectedContract.estado)}`}>{statusLabel(selectedContract.estado)}</Badge>
                  </div>
                  <div className="p-5">
                    <p className="text-[11px] text-slate-400">Stripe</p>
                    <Badge className={statusClass(selectedContract.estado || "—")}>
                      {selectedContract.estado === "activo" ? "ACTIVE" : selectedContract.estado === "pausado" ? "PAUSED" : selectedContract.estado || "—"}
                    </Badge>
                  </div>
                  <div className="p-5">
                    <p className="text-[11px] text-slate-400">Facturación</p>
                    <Badge className={statusClass(contractInvoices[0]?.estado || "—")}>
                      {statusLabel(contractInvoices[0]?.estado || "Sin factura")}
                    </Badge>
                  </div>
                  <div className="p-5">
                    <p className="text-[11px] text-slate-400">Cobro</p>
                    <Badge className={statusClass(
                      payments.find((p) => p.maintenance_invoice_id === contractInvoices[0]?.id)?.status || "—"
                    )}>
                      {statusLabel(payments.find((p) => p.maintenance_invoice_id === contractInvoices[0]?.id)?.status || "Sin cobro")}
                    </Badge>
                  </div>
                </div>
              </section>

              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">Stripe</h2>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Identidad Stripe y estado local sincronizado en maintenance_contracts.
                  </p>
                </div>

                <div className="grid gap-4 p-5 md:grid-cols-2">
                  {[
                    ["Customer ID", selectedContract.stripe_customer_id],
                    ["Subscription ID", selectedContract.stripe_subscription_id],
                    ["Price ID", selectedContract.stripe_price_id],
                    ["Checkout Session", selectedContract.stripe_checkout_session_id],
                    ["Periodo actual", `${fmtDate(selectedContract.current_period_start)} → ${fmtDate(selectedContract.current_period_end)}`],
                    ["Estado Stripe reflejado", selectedContract.estado === "activo" ? "active" : selectedContract.estado === "pausado" ? "paused" : selectedContract.estado || "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="border-b border-slate-100 pb-3">
                      <p className="text-[11px] text-slate-400">{label}</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-700">{value || "—"}</p>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-100 px-5 py-4">
                  <p className="text-[11px] leading-5 text-slate-500">
                    La Edge Function actual reserva <strong>get_subscription_status</strong> y <strong>reconcile_subscription</strong>
                    para el flujo autenticado de cliente/empresa; no se fuerza desde el navegador del worker.
                    Si quieres reconciliación Stripe en tiempo real para empleados, debe añadirse una acción backend específica
                    que valide <strong>current_user_is_worker()</strong>.
                  </p>
                </div>
              </section>

              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">Plan de mantenimiento</h2>
                  <p className="mt-1 text-[11px] text-slate-500">Detalle comercial, snapshot contractual y peculiaridades del plan.</p>
                </div>
                <div className="grid gap-4 p-5 md:grid-cols-2">
                  {[
                    ["Código", plan?.code || selectedContract.plan_snapshot?.code || "—"],
                    ["Nombre", plan?.nombre || selectedContract.plan_snapshot?.nombre || selectedContract.nombre_plan || "—"],
                    ["Descripción", plan?.descripcion || selectedContract.plan_snapshot?.descripcion || "—"],
                    ["Precio de catálogo", plan?.precio != null ? money(plan.precio, plan.moneda || selectedContract.moneda || "EUR") : "Personalizado"],
                    ["Periodicidad", plan?.periodicidad || selectedContract.periodicidad || "—"],
                    ["Moneda", plan?.moneda || selectedContract.moneda || "—"],
                    ["Plan personalizado", plan?.es_personalizado ? "Sí" : "No"],
                    ["Cambio de plan pendiente", selectedContract.pending_plan_id ? `${planMap.get(selectedContract.pending_plan_id)?.nombre || selectedContract.pending_plan_id} · ${fmtDate(selectedContract.pending_change_effective_at)}` : "No"],
                  ].map(([label, value]) => (
                    <div key={label} className="border-b border-slate-100 pb-3">
                      <p className="text-[11px] text-slate-400">{label}</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-800">{value || "—"}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t border-slate-100 px-5 py-4">
                  <p className="text-[11px] leading-5 text-slate-500">
                    El catálogo de planes no dispone de una tabla independiente de documentos. Cuando este contrato procede de una propuesta personalizada,
                    su documentación contractual se conserva en la propuesta de origen y se muestra desde su ficha.
                  </p>
                  {customProposalId && (
                    <button onClick={() => openProposal(customProposalId)} className="mt-3 inline-flex items-center gap-1.5 border border-slate-200 px-3 py-2 text-[11px] font-medium hover:bg-slate-50">
                      Ver documentación de la propuesta origen <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </section>
<section className="border border-slate-200 bg-white">
  <div className="border-b border-slate-100 px-5 py-4">
    <h2 className="text-sm font-semibold text-slate-900">
      Configuración fiscal del contrato
    </h2>
    <p className="mt-1 text-[11px] text-slate-500">
      El IVA mostrado pertenece a este contrato y queda congelado para su
      facturación. Cambiar la recomendación fiscal de la empresa no modifica
      contratos ya creados.
    </p>
  </div>

  <div className="grid gap-4 p-5 md:grid-cols-2">
    <div className="border-b border-slate-100 pb-3">
      <p className="text-[11px] text-slate-400">IVA aplicado</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">
        {selectedContract.iva_aplicado
          ? `${Number(selectedContract.iva_porcentaje ?? 0)} %`
          : "No aplicado"}
      </p>
    </div>

    <div className="border-b border-slate-100 pb-3">
      <p className="text-[11px] text-slate-400">Origen</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">
        {selectedContract.iva_source === "worker"
          ? "Configurado por trabajador"
          : selectedContract.iva_source === "client_request"
            ? "Solicitud del cliente"
            : "Recomendación de empresa"}
      </p>
    </div>
  </div>

  <div className="border-t border-slate-100 p-5">
    <p className="text-[11px] font-semibold text-slate-700">
      Modificar IVA del contrato
    </p>

    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="block flex-1 text-[11px] text-slate-500">
        Porcentaje de IVA
        <div className="relative mt-1">
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue={
              selectedContract.iva_aplicado
                ? Number(selectedContract.iva_porcentaje ?? 21)
                : 0
            }
            className="h-9 w-full border border-slate-200 bg-white px-3 pr-8 text-xs outline-none focus:border-[#102A66]/40"
            id={`maintenance-iva-${selectedContract.id}`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
            %
          </span>
        </div>
      </label>

      <button
        type="button"
        onClick={() => {
          const input = document.getElementById(
            `maintenance-iva-${selectedContract.id}`
          ) as HTMLInputElement | null;

          const value = Number(input?.value ?? 0);

          void updateMaintenanceContractIva(
            selectedContract.id,
            value > 0,
            value
          );
        }}
        disabled={maintenanceIvaActionLoading === selectedContract.id}
        className="inline-flex h-9 items-center justify-center gap-1.5 bg-[#102A66] px-3 text-xs font-medium text-white disabled:opacity-50"
      >
        {maintenanceIvaActionLoading === selectedContract.id ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Guardar IVA
      </button>
    </div>

    <div className="mt-3 flex items-start gap-2 border border-blue-100 bg-blue-50/60 px-3 py-2.5">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1E3A8A]" />
      <p className="text-[11px] leading-5 text-slate-600">
        Este valor se aplica únicamente a este contrato. La recomendación
        fiscal de la empresa puede cambiar posteriormente sin modificar este
        contrato ni sus facturas históricas.
      </p>
    </div>
  </div>
</section>
              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">Proyectos asociados</h2>
                  <p className="mt-1 text-[11px] text-slate-500">Escritura disponible para workers mediante las RPC 071.</p>
                </div>
                <div className="p-5">
                  <div className="flex flex-col gap-2 md:flex-row">
                    <select
                      value={projectToAssign}
                      onChange={(e) => setProjectToAssign(e.target.value)}
                      className="h-9 flex-1 border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#102A66]/40"
                    >
                      <option value="">Seleccionar proyecto de la empresa…</option>
                      {projects
                        .filter((p) => p.company_id === selectedContract.company_id)
                        .filter((p) => projectRelations.length === 0 || !projectRelations.some((r) => r.project_id === p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre || p.name || p.titulo || p.id}
                          </option>
                        ))}
                    </select>
                    {projectRelations.length === 0 ? (
                      <button
                        onClick={() => void assignProject()}
                        disabled={!projectToAssign || projectLoading}
                        className="inline-flex h-9 items-center justify-center gap-1.5 bg-[#102A66] px-3 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {projectLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Asociar
                      </button>
                    ) : (
                      <button
                        onClick={() => void changeProject(projectRelations[0])}
                        disabled={!projectToAssign || projectLoading || projectToAssign === projectRelations[0].project_id}
                        className="inline-flex h-9 items-center justify-center gap-1.5 border border-[#102A66] px-3 text-xs font-medium text-[#102A66] disabled:opacity-50"
                      >
                        {projectLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                        Cambiar proyecto
                      </button>
                    )}
                  </div>

                  <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                    {projectRelations.map((r) => {
                      const p = projectMap.get(r.project_id || "");
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">{p?.nombre || p?.name || p?.titulo || r.project_id}</p>
                            <p className="font-mono text-[10px] text-slate-400">{r.project_id}</p>
                          </div>
                          <button
                            onClick={() => void removeProject(r)}
                            disabled={projectRemoving === r.id}
                            className="inline-flex items-center gap-1.5 border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700 disabled:opacity-50"
                          >
                            {projectRemoving === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            Quitar
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {projectRelations.length === 0 && (
                    <p className="pt-4 text-xs text-slate-400">No hay proyectos asociados.</p>
                  )}
                </div>
              </section>

              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">Automatizaciones asociadas</h2>
                  <p className="mt-1 text-[11px] text-slate-500">Solo lectura: la arquitectura actual no expone una RPC worker segura para modificar esta relación.</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {automationRelations.map((r) => {
                    const a = automationMap.get(r.automation_id || "");
                    return (
                      <div key={r.id} className="px-5 py-3">
                        <p className="text-sm font-medium text-slate-800">{a?.name || a?.nombre || a?.title || r.automation_id}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">{r.automation_id}</p>
                      </div>
                    );
                  })}
                  {automationRelations.length === 0 && <p className="px-5 py-4 text-xs text-slate-400">No hay automatizaciones asociadas.</p>}
                </div>
              </section>
            </div>

            <aside className="space-y-7">
              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">Incidencias de cobro</h2>
                </div>
                <div className="p-5">
                  <div className="text-2xl font-semibold text-slate-950">{selectedContract.billing_failure_count || 0}</div>
                  <p className="mt-1 text-xs text-slate-500">fallos consecutivos</p>
                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                      <span className="text-slate-500">Último fallo</span>
                      <span className="font-medium text-slate-800">{fmtDateTime(selectedContract.last_payment_failed_at)}</span>
                    </div>
                    <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
                      <span className="text-slate-500">Bloqueado</span>
                      <span className="font-medium text-slate-800">{fmtDateTime(selectedContract.billing_blocked_at)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Motivo</span>
                      <p className="mt-1 text-slate-700">{selectedContract.billing_block_reason || "—"}</p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">Datos fiscales</h2>
                </div>
                <div className="p-5">
                  <Badge className={fiscalComplete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}>
                    {fiscalComplete ? "Completo" : "Incompleto"}
                  </Badge>
                  <div className="mt-4 space-y-3 text-xs">
                    {[
                      ["Razón social", company?.legal_name || company?.company_name],
                      ["CIF/VAT", company?.cif_vat],
                      ["Email facturación", company?.billing_email],
                      ["Dirección", company?.address],
                      ["CP / Ciudad", `${company?.postal_code || "—"} ${company?.city || ""}`],
                      ["Provincia / País", `${company?.province || "—"} / ${company?.country || "—"}`],
                    ].map(([label, value]) => (
                      <div key={label} className="border-b border-slate-100 pb-2">
                        <p className="text-slate-400">{label}</p>
                        <p className="mt-1 text-slate-800">{value || "—"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">Cambio fiscal / empresa</h2>
                </div>
                <div className="p-5 text-xs">
                  {(() => {
                    const request = companyChangeRequests
                      .filter((r) => Boolean(r.user_id && r.requested_company_id === selectedContract.company_id) || r.company_id === selectedContract.company_id)
                      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

                    if (!request) {
                      return <p className="text-slate-400">No hay una solicitud reciente asociada a esta empresa.</p>;
                    }

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-slate-500">Estado</span>
                          <Badge className={statusClass(request.status)}>{statusLabel(request.status)}</Badge>
                        </div>
                        <div className="border-t border-slate-100 pt-3">
                          <p className="text-slate-400">Razón social solicitada</p>
                          <p className="mt-1 text-slate-800">{request.requested_legal_name || "—"}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">NIF/CIF/VAT solicitado</p>
                          <p className="mt-1 text-slate-800">{request.requested_cif_vat || "—"}</p>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Esta información es el registro de la solicitud; no sustituye los datos fiscales actuales de companies.
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </section>

              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">Facturación del contrato</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Factura</th>
                        <th className="px-4 py-3">Periodo</th>
                        <th className="px-4 py-3">Importe</th>
                        <th className="px-4 py-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {contractInvoices.map((i) => (
                        <tr key={i.id}>
                          <td className="px-4 py-3 font-medium">{i.serie}-{i.numero}</td>
                          <td className="px-4 py-3 text-slate-500">{fmtDate(i.periodo_inicio)} → {fmtDate(i.periodo_fin)}</td>
                          <td className="px-4 py-3 font-semibold">{money(i.importe_a_pagar, i.moneda)}</td>
                          <td className="px-4 py-3"><Badge className={statusClass(i.estado)}>{statusLabel(i.estado)}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {contractInvoices.length === 0 && <p className="px-5 py-5 text-xs text-slate-400">No hay facturas asociadas.</p>}
              </section>

              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">Historial / actividad</h2>
                  <p className="mt-1 text-[11px] text-slate-500">activity_log global, filtrado por resource_id del contrato.</p>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {activityLog
                    .filter((a) => a.resource_id === selectedContract.id)
                    .map((a) => (
                      <div key={a.id} className="border-b border-slate-100 px-5 py-3">
                        <p className="text-xs font-medium text-slate-800">{a.action}</p>
                        <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{a.description || "Sin descripción."}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{fmtDateTime(a.created_at)}</p>
                      </div>
                    ))}
                  {activityLog.filter((a) => a.resource_id === selectedContract.id).length === 0 && (
                    <p className="px-5 py-5 text-xs text-slate-400">No hay actividad registrada para este contrato.</p>
                  )}
                </div>
              </section>

              <section className="border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">Propuesta origen</h2>
                </div>
                <div className="p-5 text-xs">
                  {customProposalId ? (
                    <>
                      <p className="text-slate-400">Propuesta Custom</p>
                      <button
                        className="mt-1 break-all text-left font-mono text-[#102A66] hover:underline"
                        onClick={() => {
                          openProposal(customProposalId);
                        }}
                      >
                        {customProposalId}
                      </button>
                    </>
                  ) : (
                    <p className="text-slate-400">Este contrato no tiene una propuesta Custom de origen.</p>
                  )}
                </div>
              </section>
            </aside>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center border border-slate-200 bg-white text-slate-600"
              aria-label="Abrir navegación"
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => go(basePath)} className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center bg-[#102A66] text-white">
                <Wrench className="h-4 w-4" />
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold">Modira</p>
                <p className="text-[9px] uppercase tracking-[0.16em] text-slate-400">Employee Area</p>
              </div>
            </button>
          </div>
          <Badge className="border-[#102A66]/15 bg-[#102A66]/5 text-[#102A66]">Mantenimiento</Badge>
        </div>

        {menuOpen && (
          <div className="absolute left-4 top-[4.5rem] z-[60] w-[280px] border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Employee Area</p>
              <p className="mt-1 text-sm font-medium text-slate-800">Navegación</p>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-2">
              {[
                ["dashboard", "Dashboard"],
                ["projects", "Proyectos"],
                ["companies", "Empresas"],
                ["quotations", "Presupuestos"],
                ["billing", "Facturación"],
                ["payments", "Pagos"],
                ["support", "Soporte"],
                ["ai", "IA"],
                ["notifications", "Notificaciones"],
                ["activity", "Actividad"],
                ["audits", "Auditorías"],
                ["companyChanges", "Cambios de empresa"],
                ["maintenance", "Mantenimiento"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => menuNavigate(id)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm ${
                    id === "maintenance" ? "bg-[#102A66]/5 font-medium text-[#102A66]" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8 lg:py-9">
        {error && (
          <div className="mb-6 flex items-start gap-3 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">No se ha podido cargar toda la información.</p>
              <p className="mt-0.5 text-xs">{error}</p>
            </div>
            <button onClick={() => void load()} className="border border-red-200 bg-white px-3 py-1.5 text-xs">Reintentar</button>
          </div>
        )}

        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#102A66]">Modira Care · CRM interno</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Mantenimiento</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Gestión centralizada de contratos, facturación, cobros Stripe, documentación y propuestas personalizadas.
            </p>
          </div>
          <button
            onClick={() => void load(true)}
            disabled={refreshing}
            className="inline-flex h-9 items-center gap-2 border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        <div className="mb-7 grid border-y border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-5">
          <Stat label="Facturado este mes" value={money(currentMonthRevenue)} detail="maintenance_invoices emitidas este mes" icon={<CircleDollarSign className="h-4 w-4" />} />
          <Stat label="Contratos activos" value={activeContracts.length} detail="activo + pausado" icon={<Wrench className="h-4 w-4" />} />
          <Stat label="Solicitudes de cancelación" value={cancellationPending} detail="contratos con cancelación programada" icon={<AlertCircle className="h-4 w-4" />} />
          <Stat label="Propuestas pendientes" value={proposalPending} detail="requieren gestión del worker" icon={<FileCheck2 className="h-4 w-4" />} />
          <Stat label="Incidencias de cobro" value={billingIncidents + pendingInvoiceCount} detail={`${billingIncidents} contratos con fallos · ${pendingInvoiceCount} facturas pendientes`} icon={<CreditCard className="h-4 w-4" />} />
        </div>

        {(billingIncidents > 0 || fiscalIncomplete > 0 || documentPending > 0 || proposalPending > 0 || pendingProjectChangeCount > 0) && (
          <section className="mb-8">
            <SectionHeader eyebrow="Centro operativo" title="Elementos que requieren atención" text="Derivados de estados y campos ya existentes; no se crea una tabla de incidencias paralela." />
            <div className="grid border-y border-slate-200 bg-white md:grid-cols-2 xl:grid-cols-5">
              {[
                ["Cobros", billingIncidents, "Contratos con fallos o bloqueo de cobro", "stripe"],
                ["Fiscal", fiscalIncomplete, "Empresas con datos fiscales incompletos", "maintenance"],
                ["Documentos", documentPending, "Facturas sin documento Modira/PDF", "billing"],
                ["Propuestas", proposalPending, "Propuestas Custom pendientes", "proposals"],
                ["Fiscal", pendingFiscalChangeCount, "Solicitudes de cambio fiscal/empresa pendientes", "companyChanges"],
                ["Proyectos", pendingProjectChangeCount, "Solicitudes de cambio de proyecto pendientes", "maintenance"],
              ].map(([title, count, text, target]) => (
                <button
                  key={String(title)}
                  onClick={() => setTab(target as any)}
                  className="border-r border-slate-100 px-4 py-4 text-left last:border-r-0 hover:bg-slate-50"
                >
                  <p className="text-xs font-semibold text-slate-900">{title}</p>
                  <p className="mt-1 text-xl font-semibold">{count}</p>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">{text}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        <nav className="mb-6 flex overflow-x-auto border-b border-slate-200">
          {[
            ["maintenance", "Mantenimientos"],
            ["billing", "Facturación"],
            ["stripe", "Cobros Stripe"],
            ["proposals", "Propuestas personalizadas"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id as typeof tab)}
              className={`relative whitespace-nowrap px-4 py-3 text-sm font-medium ${
                tab === id ? "text-[#102A66]" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {label}
              {tab === id && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-[#102A66]" />}
            </button>
          ))}
        </nav>

        {tab === "maintenance" && (
          <section>
            {projectChangeRequests.length > 0 && (
              <section className="mb-8 border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-900">Solicitudes de cambio de proyecto</h2>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Solicitudes realizadas por clientes. El cambio aprobado se aplica en la siguiente fecha de facturación efectiva y no altera el ciclo del contrato.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Empresa</th>
                        <th className="px-4 py-3">Contrato</th>
                        <th className="px-4 py-3">Proyecto actual</th>
                        <th className="px-4 py-3">Proyecto solicitado</th>
                        <th className="px-4 py-3">Solicitud</th>
                        <th className="px-4 py-3">Estado</th>
                        <th className="px-4 py-3">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {projectChangeRequests.map((request) => {
                        const company = companyMap.get(request.company_id);
                        const contract = contracts.find((c) => c.id === request.maintenance_contract_id);
                        const pending = norm(request.status) === "pending";
                        const approved = norm(request.status) === "approved";
                        const actionLoading = projectChangeActionLoading === request.id;

                        return (
                          <tr key={request.id} className="align-top hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">{companyLabel(company)}</p>
                              <p className="mt-0.5 font-mono text-[10px] text-slate-400">{request.company_id}</p>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => openContract(request.maintenance_contract_id)}
                                className="font-mono text-[10px] text-[#102A66] hover:underline"
                              >
                                {request.maintenance_contract_id}
                              </button>
                              <p className="mt-1 text-[10px] text-slate-400">
                                {contract ? statusLabel(contract.estado) : "Contrato no disponible"}
                              </p>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-700">
                              {projectChangeProjectName(request.current_project_id)}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-700">
                              {projectChangeProjectName(request.requested_project_id)}
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              {fmtDateTime(request.requested_at)}
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={statusClass(request.status)}>
                                {statusLabel(request.status)}
                              </Badge>
                              {approved && request.effective_at && (
                                <p className="mt-1 text-[10px] text-slate-500">
                                  Efectivo: {fmtDate(request.effective_at)}
                                </p>
                              )}
                              {norm(request.status) === "rejected" && request.rejection_reason && (
                                <p className="mt-1 max-w-[220px] text-[10px] leading-4 text-red-600">
                                  {request.rejection_reason}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {pending ? (
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void approveProjectChange(request.id)}
                                    disabled={actionLoading}
                                    className="inline-flex items-center gap-1 border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-medium text-emerald-700 disabled:opacity-50"
                                  >
                                    {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                    Aprobar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setProjectChangeRejectingId(request.id);
                                      setProjectChangeRejectionReason("");
                                    }}
                                    disabled={actionLoading}
                                    className="inline-flex items-center gap-1 border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-medium text-red-700 disabled:opacity-50"
                                  >
                                    <X className="h-3 w-3" />
                                    Rechazar
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400">
                                  {approved ? "Aprobada" : "Sin acciones"}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
{maintenanceIvaRequests.length > 0 && (
  <section className="mb-8 border border-slate-200 bg-white">
    <div className="border-b border-slate-100 px-5 py-4">
      <h2 className="text-sm font-semibold text-slate-900">
        Solicitudes de cambio de IVA
      </h2>
      <p className="mt-1 text-[11px] text-slate-500">
        Solicitudes realizadas por clientes para modificar el tratamiento de
        IVA de su empresa o de un contrato de mantenimiento.
      </p>
    </div>

    <div className="overflow-x-auto">
      <table className="w-full min-w-[1050px] text-xs">
        <thead className="border-b border-slate-100 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3">Empresa</th>
            <th className="px-4 py-3">Contrato</th>
            <th className="px-4 py-3">IVA solicitado</th>
            <th className="px-4 py-3">Mensaje</th>
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Acciones</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {maintenanceIvaRequests.map((request) => {
            const company = companyMap.get(request.company_id);
            const contract = request.maintenance_contract_id
              ? contracts.find(
                  (c) => c.id === request.maintenance_contract_id
                )
              : null;

            const pending = ["pending", "in_review"].includes(
              norm(request.status)
            );

            const actionLoading =
              maintenanceIvaActionLoading === request.id;

            return (
              <tr key={request.id} className="align-top hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">
                    {companyLabel(company)}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                    {request.company_id}
                  </p>
                </td>

                <td className="px-4 py-3">
                  {contract ? (
                    <button
                      type="button"
                      onClick={() => openContract(contract.id)}
                      className="font-mono text-[10px] text-[#102A66] hover:underline"
                    >
                      {contract.id}
                    </button>
                  ) : (
                    <span className="text-slate-400">
                      Empresa / nuevo contrato
                    </span>
                  )}
                </td>

                <td className="px-4 py-3 font-semibold text-slate-800">
                  {request.requested_iva_aplicado
                    ? `${Number(request.requested_iva_porcentaje ?? 0)} %`
                    : "IVA no aplicado"}
                </td>

                <td className="max-w-[300px] px-4 py-3 text-slate-600">
                  {request.message || "—"}
                </td>

                <td className="px-4 py-3 text-slate-500">
                  {fmtDateTime(request.created_at)}
                </td>

                <td className="px-4 py-3">
                  <Badge className={statusClass(request.status)}>
                    {statusLabel(request.status)}
                  </Badge>

                  {request.reviewed_at && (
                    <p className="mt-1 text-[10px] text-slate-400">
                      Revisada: {fmtDateTime(request.reviewed_at)}
                    </p>
                  )}

                  {request.worker_notes && (
                    <p className="mt-1 max-w-[220px] text-[10px] leading-4 text-slate-500">
                      {request.worker_notes}
                    </p>
                  )}
                </td>

                <td className="px-4 py-3">
                  {pending ? (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          void resolveMaintenanceIvaRequest(
                            request.id,
                            "approved"
                          )
                        }
                        disabled={actionLoading}
                        className="inline-flex items-center gap-1 border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-medium text-emerald-700 disabled:opacity-50"
                      >
                        {actionLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        Aprobar
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setMaintenanceIvaRejectingId(request.id);
                          setMaintenanceIvaRejectionReason("");
                        }}
                        disabled={actionLoading}
                        className="inline-flex items-center gap-1 border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-medium text-red-700 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        Rechazar
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400">
                      Sin acciones
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </section>
)}
            <SectionHeader
              eyebrow="Contratos"
              title="Mantenimientos"
              text="Ordenados por contratación/creación más reciente. La tabla permanece compacta y el detalle vive en una ruta independiente."
            />

            <div className="mb-4 grid gap-2 lg:grid-cols-[1fr_180px_160px_160px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar empresa, contrato, plan o Stripe…"
                  className="h-9 w-full border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-[#102A66]/40"
                />
              </div>
              <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="h-9 border border-slate-200 bg-white px-3 text-xs">
                <option value="all">Todas las empresas</option>
                {companies.filter((c) => contracts.some((x) => x.company_id === c.id)).map((c) => <option key={c.id} value={c.id}>{companyLabel(c)}</option>)}
              </select>
              <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="h-9 border border-slate-200 bg-white px-3 text-xs">
                <option value="all">Todos los planes</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 border border-slate-200 bg-white px-3 text-xs">
                <option value="all">Todos los estados</option>
                <option value="activo">Activo</option>
                <option value="pausado">Pausado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>

            <div className="overflow-hidden border border-slate-200 bg-white">
              <div className="max-h-[330px] overflow-auto">
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Empresa</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Precio</th>
                      <th className="px-4 py-3">Periodo</th>
                      <th className="px-4 py-3">Renovación</th>
                      <th className="px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredContracts.map((c) => {
                      const company = companyMap.get(c.company_id);
                      const plan = c.plan_id ? planMap.get(c.plan_id) : null;
                      return (
                        <tr
                          key={c.id}
                          onClick={() => openContract(c.id)}
                          title="Abrir detalle completo del plan de mantenimiento"
                          className="cursor-pointer align-top hover:bg-slate-50"
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{companyLabel(company)}</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">{c.company_id}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{plan?.nombre || c.nombre_plan || "—"}</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">{plan?.code || "—"}</p>
                          </td>
                          <td className="px-4 py-3 font-semibold">{money(c.agreed_monthly_price ?? c.precio, c.moneda || "EUR")}</td>
                          <td className="px-4 py-3 text-slate-600">{fmtDate(c.current_period_start)} → {fmtDate(c.current_period_end)}</td>
                          <td className="px-4 py-3">
                            {c.cancel_at_period_end ? (
                              <>
                                <span className="font-medium text-amber-700">Cancelación solicitada</span>
                                <p className="mt-0.5 text-[10px]">Finaliza {fmtDate(c.cancel_effective_at)}</p>
                              </>
                            ) : (
                              fmtDate(c.current_period_end)
                            )}
                          </td>
                          <td className="px-4 py-3"><Badge className={statusClass(c.estado)}>{statusLabel(c.estado)}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredContracts.length === 0 && <Empty icon={<Wrench className="h-5 w-5" />} title="Sin mantenimientos" text="No hay contratos que coincidan con los filtros." />}
            </div>
          </section>
        )}

        {tab === "billing" && (
          <section id="maintenance-invoices">
            <SectionHeader eyebrow="Facturación" title="Facturas de mantenimiento" text="Histórico independiente de public.invoices. Las facturas emitidas no se editan ni eliminan desde el CRM." />
            <div className="mb-4 grid gap-2 lg:grid-cols-[1fr_160px_150px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar factura, empresa, cliente, Stripe…" className="h-9 w-full border border-slate-200 bg-white pl-9 pr-3 text-xs" />
              </div>
              <select value={invoiceStatusFilter} onChange={(e) => setInvoiceStatusFilter(e.target.value)} className="h-9 border border-slate-200 bg-white px-3 text-xs">
                <option value="all">Todos los estados</option>
                {["borrador", "pendiente", "enviada", "pagada", "impagada", "anulada", "rectificada"].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
              <select value={invoiceDocumentFilter} onChange={(e) => setInvoiceDocumentFilter(e.target.value)} className="h-9 border border-slate-200 bg-white px-3 text-xs">
                <option value="all">Todos los documentos</option>
                <option value="modira">Con Modira</option>
                <option value="stripe">Con Stripe</option>
                <option value="both">Ambos</option>
                <option value="none">Sin documento</option>
              </select>
            </div>

            <div className="overflow-hidden border border-slate-200 bg-white">
              <div className="max-h-[360px] overflow-auto">
                <table className="w-full min-w-[1080px] text-xs">
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Factura</th>
                      <th className="px-4 py-3">Empresa / cliente</th>
                      <th className="px-4 py-3">Periodo</th>
                      <th className="px-4 py-3">Importe</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Documento</th>
                      <th className="px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredInvoices.map((i) => {
                      const hasModira = Boolean(i.document_path || i.pdf_storage_path || i.electronic_document_storage_path);
                      const stripePath = i.stripe_pdf_storage_path || null;
                      const hasStripe = Boolean(stripePath);
                      const modiraPath = i.document_path || i.pdf_storage_path || i.electronic_document_storage_path;
                      return (
                        <tr key={i.id} className="align-top hover:bg-slate-50">
                          <td className="px-4 py-3 font-semibold">{i.serie}-{i.numero}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{i.customer_legal_name || companyLabel(i.company_id ? companyMap.get(i.company_id) : null)}</p>
                            <p className="mt-0.5 text-[10px] text-slate-400">{i.customer_tax_id || "—"}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{fmtDate(i.periodo_inicio)} → {fmtDate(i.periodo_fin)}</td>
                          <td className="px-4 py-3 font-semibold">{money(i.importe_a_pagar, i.moneda)}</td>
                          <td className="px-4 py-3"><Badge className={statusClass(i.estado)}>{statusLabel(i.estado)}</Badge></td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {hasModira && <Badge className="border-blue-200 bg-blue-50 text-blue-700">Modira</Badge>}
                              {hasStripe && <Badge className="border-purple-200 bg-purple-50 text-purple-700">Stripe</Badge>}
                              {!hasModira && !hasStripe && <span className="text-slate-400">Sin documento</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {modiraPath && (
                                <button onClick={() => void openDocument(modiraPath, INVOICE_BUCKET)} className="border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium hover:bg-slate-50">Ver Modira</button>
                              )}
                              {stripePath && (
                                <button onClick={() => void openDocument(stripePath, INVOICE_BUCKET)} className="border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium hover:bg-slate-50">Ver Stripe</button>
                              )}
                              {!i.document_path && (
                                <label className="inline-flex cursor-pointer items-center gap-1 border border-[#102A66] bg-[#102A66] px-2 py-1 text-[10px] font-medium text-white">
                                  <Upload className="h-3 w-3" />
                                  Adjuntar PDF
                                  <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void uploadInvoicePdf(i, e)} />
                                </label>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredInvoices.length === 0 && <Empty icon={<FileText className="h-5 w-5" />} title="Sin facturas" text="No hay facturas que coincidan con los filtros." />}
            </div>
          </section>
        )}

        {tab === "stripe" && (
          <section>
            <SectionHeader eyebrow="Cobros Stripe" title="Cobros y facturas Stripe" text="Factura y cobro se mantienen separados: esta vista relaciona el invoice de mantenimiento con el payment disponible." />
            <div className="mb-4 grid gap-2 lg:grid-cols-[1fr_170px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar factura, empresa, suscripción…" className="h-9 w-full border border-slate-200 bg-white pl-9 pr-3 text-xs" />
              </div>
              <select value={stripeFilter} onChange={(e) => setStripeFilter(e.target.value)} className="h-9 border border-slate-200 bg-white px-3 text-xs">
                <option value="all">Todos los estados</option>
                <option value="succeeded">Pagado</option>
                <option value="paid">Pagado</option>
                <option value="failed">Fallido</option>
                <option value="pending">Pendiente</option>
                <option value="impagada">Impagado</option>
              </select>
            </div>

            <div className="overflow-hidden border border-slate-200 bg-white">
              <div className="max-h-[360px] overflow-auto">
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Factura Stripe</th>
                      <th className="px-4 py-3">Empresa</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Importe</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Suscripción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStripeRows.map(({ invoice, contract, payment }) => {
                      const state = payment?.status || payment?.estado || invoice.estado;
                      return (
                        <tr key={invoice.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-[10px]">{invoice.stripe_invoice_id || "—"}</td>
                          <td className="px-4 py-3 font-medium">{invoice.customer_legal_name}</td>
                          <td className="px-4 py-3 text-slate-500">{fmtDate(invoice.fecha_emision)}</td>
                          <td className="px-4 py-3 font-semibold">{money(invoice.importe_a_pagar, invoice.moneda)}</td>
                          <td className="px-4 py-3"><Badge className={statusClass(state)}>{statusLabel(state)}</Badge></td>
                          <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{contract?.stripe_subscription_id || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredStripeRows.length === 0 && <Empty icon={<CreditCard className="h-5 w-5" />} title="Sin cobros Stripe" text="No hay cobros/facturas Stripe relacionados con mantenimiento." />}
            </div>
          </section>
        )}

        {tab === "proposals" && (
          <section>
            <SectionHeader
              eyebrow="Custom"
              title="Propuestas personalizadas"
              text="El worker puede revisar, solicitar aclaraciones, cotizar o rechazar. La aceptación contractual la realiza el cliente mediante el flujo existente."
            />

            <div className="mb-5 grid border-y border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["Pendientes", proposals.filter((p) => norm(p.status) === "submitted").length],
                ["En revisión", proposals.filter((p) => norm(p.status) === "in_review").length],
                ["Esperando información", proposals.filter((p) => norm(p.status) === "clarification_requested").length],
                ["Enviadas", proposals.filter((p) => norm(p.status) === "quoted").length],
                ["Aceptadas", proposals.filter((p) => norm(p.status) === "accepted").length],
              ].map(([label, value]) => (
                <div key={String(label)} className="px-4 py-4">
                  <p className="text-[11px] text-slate-400">{label}</p>
                  <p className="mt-1 text-xl font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="mb-4 grid gap-2 lg:grid-cols-[1fr_180px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={proposalSearch} onChange={(e) => setProposalSearch(e.target.value)} placeholder="Buscar propuesta o empresa…" className="h-9 w-full border border-slate-200 bg-white pl-9 pr-3 text-xs" />
              </div>
              <select value={proposalFilter} onChange={(e) => setProposalFilter(e.target.value)} className="h-9 border border-slate-200 bg-white px-3 text-xs">
                <option value="all">Todos los estados</option>
                {["submitted", "in_review", "clarification_requested", "quoted", "accepted", "rejected", "cancelled", "expired"].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
            </div>

            <div className="overflow-hidden border border-slate-200 bg-white">
              <div className="max-h-[390px] overflow-auto">
                <table className="w-full min-w-[980px] text-xs">
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Empresa</th>
                      <th className="px-4 py-3">Propuesta</th>
                      <th className="px-4 py-3">Precio</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Contratación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProposals.map((p) => {
                      const company = companyMap.get(p.company_id);
                      const contract = contracts.find((c) => c.maintenance_custom_proposal_id === p.id);
                      const open = selectedProposalId === p.id;
                      return (
                        <tr key={p.id} onClick={() => openProposal(p.id)} className="cursor-pointer hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium">{companyLabel(company)}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{p.titulo}</p>
                            <p className="mt-0.5 font-mono text-[10px] text-slate-400">{p.id}</p>
                          </td>
                          <td className="px-4 py-3 font-semibold">{p.quoted_monthly_price != null ? money(p.quoted_monthly_price, p.quoted_currency || "EUR") : "Pendiente"}</td>
                          <td className="px-4 py-3"><Badge className={statusClass(p.status)}>{statusLabel(p.status)}</Badge></td>
                          <td className="px-4 py-3 text-slate-500">{fmtDate(p.created_at)}</td>
                          <td className="px-4 py-3">{contract ? "Contrato creado" : "Pendiente"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </section>
        )}
{maintenanceIvaRejectingId && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-4">
    <div className="w-full max-w-md border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Rechazar cambio de IVA
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            El motivo quedará registrado en la solicitud.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (maintenanceIvaActionLoading) return;
            setMaintenanceIvaRejectingId(null);
            setMaintenanceIvaRejectionReason("");
          }}
          className="text-slate-400 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5">
        <label className="block text-[11px] text-slate-500">
          Motivo del rechazo *
          <textarea
            value={maintenanceIvaRejectionReason}
            onChange={(e) =>
              setMaintenanceIvaRejectionReason(e.target.value)
            }
            rows={4}
            autoFocus
            placeholder="Indica por qué no se puede aceptar el tratamiento fiscal solicitado…"
            className="mt-1 w-full border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-[#102A66]/40"
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (maintenanceIvaActionLoading) return;
              setMaintenanceIvaRejectingId(null);
              setMaintenanceIvaRejectionReason("");
            }}
            disabled={Boolean(maintenanceIvaActionLoading)}
            className="h-9 border border-slate-200 bg-white px-3 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={() =>
              void resolveMaintenanceIvaRequest(
                maintenanceIvaRejectingId,
                "rejected"
              )
            }
            disabled={
              !maintenanceIvaRejectionReason.trim() ||
              Boolean(maintenanceIvaActionLoading)
            }
            className="inline-flex h-9 items-center gap-1.5 bg-[#102A66] px-3 text-xs font-medium text-white disabled:opacity-50"
          >
            {maintenanceIvaActionLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            Confirmar rechazo
          </button>
        </div>
      </div>
    </div>
  </div>
)}
        {projectChangeRejectingId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-4">
            <div className="w-full max-w-md border border-slate-200 bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Rechazar cambio de proyecto</h2>
                  <p className="mt-1 text-[11px] text-slate-500">El motivo quedará registrado en la solicitud.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (projectChangeActionLoading) return;
                    setProjectChangeRejectingId(null);
                    setProjectChangeRejectionReason("");
                  }}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5">
                <label className="block text-[11px] text-slate-500">
                  Motivo del rechazo *
                  <textarea
                    value={projectChangeRejectionReason}
                    onChange={(e) => setProjectChangeRejectionReason(e.target.value)}
                    rows={4}
                    autoFocus
                    placeholder="Indica por qué no se puede aceptar el cambio de proyecto…"
                    className="mt-1 w-full border border-slate-200 px-2.5 py-2 text-xs outline-none focus:border-[#102A66]/40"
                  />
                </label>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (projectChangeActionLoading) return;
                      setProjectChangeRejectingId(null);
                      setProjectChangeRejectionReason("");
                    }}
                    disabled={Boolean(projectChangeActionLoading)}
                    className="h-9 border border-slate-200 bg-white px-3 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void rejectProjectChange()}
                    disabled={!projectChangeRejectionReason.trim() || Boolean(projectChangeActionLoading)}
                    className="inline-flex h-9 items-center gap-1.5 bg-[#102A66] px-3 text-xs font-medium text-white disabled:opacity-50"
                  >
                    {projectChangeActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                    Confirmar rechazo
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
