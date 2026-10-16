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
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock3,
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
  Zap,
} from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

/**
 * ============================================================================
 * MODIRA — EmployeeMaintenance.tsx
 * ============================================================================
 *
 * Área de empleado para MODIRA CARE / Mantenimiento.
 *
 * Migraciones de mantenimiento contempladas en esta pantalla:
 * - 049: planes, contratos, proyectos, facturación y RLS base.
 * - 050: documentos de facturas, Storage y asociación segura.
 * - 051: guardas fiscales y snapshot fiscal de maintenance_invoices.
 * - 067: hardening de billing, evidencia Stripe y protección documental.
 * - 068: control de fallos de cobro recurrente.
 * - 069: propuestas Custom y respuesta segura del worker.
 * - 070: límites de seguridad de propuestas Custom.
 * - 071: asociación/desasociación worker de contratos ↔ proyectos.
 * - 074: revisión worker, clarificaciones, PDFs versionados, SHA-256,
 *        acknowledgement del PDF y trazabilidad de la propuesta Custom.
 *
 * Las automatizaciones cubiertas se excluyen deliberadamente de esta pantalla
 * porque ya no forman parte del uso actual de MODIRA.
 *
 * Arquitectura respetada:
 * - Los workers tienen SELECT sobre planes, contratos, relaciones e invoices.
 * - No se reabren INSERT/UPDATE/DELETE directos donde las migraciones los
 *   revocan.
 * - La contratación/ciclo Stripe sigue en la Edge Function maintenance-stripe.
 * - La Edge Function maintenance-stripe mantiene las acciones backend de
 *   contratación/documentación; para propuestas Custom se utiliza además
 *   una acción server-side que calcula SHA-256 y ejecuta la asociación segura.
 * - Los PDFs de maintenance-invoices se suben físicamente por Storage y se
 *   asocian mediante attach_maintenance_invoice_document().
 * - El SHA-256 se calcula server-side en la Edge Function y se fija mediante
 *   set_maintenance_invoice_document_hash().
 *
 * Este archivo NO inventa DML directo sobre maintenance_contracts ni sobre
 * maintenance_contract_projects. El ciclo contractual/Stripe sigue en backend,
 * mientras que 071 expone exclusivamente las RPCs worker seguras para gestionar
 * la relación contrato ↔ proyecto.
 *
 * Lo que sí puede hacer el trabajador desde aquí:
 * 1. Consultar TODOS los planes.
 * 2. Consultar TODOS los contratos.
 * 3. Consultar proyectos cubiertos.
 * 4. Consultar automatizaciones cubiertas.
 * 5. Consultar TODAS las facturas de mantenimiento.
 * 6. Consultar payments vinculados.
 * 7. Abrir/descargar documentos privados.
 * 8. Subir el PDF Modira de una factura.
 * 9. Asociar el PDF mediante RPC segura.
 * 10. Calcular/fijar la huella SHA-256 mediante Edge Function.
 * 11. Consultar propuestas Custom y su trazabilidad.
 * 12. Revisar una propuesta, pedir aclaraciones, rechazarla o cotizarla.
 * 13. Subir el PDF de respuesta de Modira y publicarlo como nueva versión.
 * 14. Consultar hash, versiones y acknowledgement del PDF.
 * 15. Consultar el estado fiscal de las empresas cuando la tabla actual lo
 *     permita.
 *
 * No se ofrecen botones de escritura sobre datos que las migraciones no
 * permiten directamente al worker.
 * ============================================================================
 */

type AnyRow = Record<string, any>;

type Plan = {
  id: string;
  code: string;
  nombre: string;
  descripcion: string | null;
  precio: number | null;
  moneda: string;
  periodicidad: string;
  es_personalizado: boolean;
  activo: boolean;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
};

type Contract = AnyRow & {
  id: string;
  user_id: string | null;
  company_id: string;
  plan_id: string | null;
  nombre_plan: string | null;
  descripcion: string | null;
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
  plan_snapshot: AnyRow | null;
  maintenance_custom_proposal_id?: string | null;
  agreed_monthly_price?: number | null;
  scope_snapshot?: AnyRow | null;
  stripe_checkout_session_id?: string | null;
  contracted_at?: string | null;
  terms_version?: string | null;
  billing_failure_count?: number | null;
  last_payment_failed_at?: string | null;
  billing_blocked_at?: string | null;
  billing_block_reason?: string | null;
};

type MaintenanceInvoice = AnyRow & {
  id: string;
  maintenance_contract_id: string | null;
  company_id: string | null;
  user_id: string | null;
  serie: string;
  numero: number;
  estado: string;
  fecha_emision: string;
  fecha_operacion: string;
  fecha_vencimiento: string | null;
  fecha_pago: string | null;
  periodo_inicio: string;
  periodo_fin: string;
  descripcion: string;
  contract_snapshot: AnyRow | null;
  subtotal: number;
  iva_aplicado: boolean;
  iva_porcentaje: number;
  iva_importe: number;
  irpf_aplicado: boolean;
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
  electronic_format: string | null;
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
  updated_at: string;
};

type Relation = {
  id: string;
  maintenance_contract_id: string;
  project_id?: string;
  created_at: string;
};

type Company = AnyRow & {
  id: string;
  company_name?: string | null;
  legal_name?: string | null;
  cif_vat?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
};

type CompanyChangeRequest = AnyRow & {
  id: string;
  company_id?: string | null;
  status?: string | null;
  requested_at?: string | null;
  created_at?: string | null;
  requested_legal_name?: string | null;
  requested_cif_vat?: string | null;
  requested_billing_email?: string | null;
  requested_address?: string | null;
  requested_postal_code?: string | null;
  requested_city?: string | null;
  requested_province?: string | null;
  requested_country?: string | null;
  rejection_reason?: string | null;
};

type Payment = AnyRow & {
  id: string;
  company_id?: string | null;
  maintenance_invoice_id?: string | null;
  invoice_id?: string | null;
  amount?: number | null;
  monto?: number | null;
  status?: string | null;
  estado?: string | null;
  created_at?: string | null;
};

type ProposalDocument = AnyRow & {
  id: string;
  proposal_id: string;
  version: number;
  document_path: string;
  document_mime_type: string;
  document_file_size: number | null;
  document_sha256: string;
  document_uploaded_at: string;
  document_uploaded_by: string | null;
  published_at: string | null;
  created_at: string;
};

type ProposalAcknowledgement = AnyRow & {
  id: string;
  proposal_id: string;
  document_id: string;
  user_id: string;
  company_id: string;
  document_path: string;
  document_sha256: string;
  acknowledgement_text_version: string;
  accepted_at: string;
  created_at: string;
};

type ProposalEvent = AnyRow & {
  id: string;
  proposal_id: string;
  actor_id: string | null;
  actor_type: string;
  event_type: string;
  notes: string | null;
  metadata: AnyRow | null;
  created_at: string;
};

type Props = {
  basePath?: string;
  onMenuNavigate?: (id: string) => void;
};

const EDGE_FUNCTION_NAME = "maintenance-stripe";
const BUCKET = "maintenance-invoices";
const PROPOSAL_BUCKET = "maintenance-proposals";
const PROPOSAL_EDGE_ACTION = "attach_maintenance_custom_proposal_document";

function money(value: unknown, currency = "EUR") {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function date(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES");
}

function dateTime(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES");
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function labelStatus(value: unknown) {
  const status = normalize(value);
  const map: Record<string, string> = {
    activo: "Activo",
    pausado: "Pausado",
    cancelado: "Cancelado",
    pendiente: "Pendiente",
    pagada: "Pagada",
    pagado: "Pagado",
    enviada: "Enviada",
    impagada: "Impagada",
    anulada: "Anulada",
    rectificada: "Rectificada",
    borrador: "Borrador",
    pending: "Pendiente",
    succeeded: "Pagado",
    paid: "Pagado",
    failed: "Fallido",
  };
  return map[status] || String(value || "—");
}

function statusClass(value: unknown) {
  const status = normalize(value);
  if (["activo", "pagada", "pagado", "succeeded", "approved"].includes(status)) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (["pausado", "pendiente", "pending", "enviada"].includes(status)) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  if (["cancelado", "anulada", "impagada", "failed", "rejected"].includes(status)) {
    return "bg-red-50 text-red-700 border-red-200";
  }
  if (["submitted", "quoted"].includes(status)) {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }
  if (["in_review", "clarification_requested"].includes(status)) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function companyName(company?: Company | null) {
  if (!company) return "Empresa sin identificar";
  return (
    company.legal_name ||
    company.company_name ||
    company.name ||
    company.nombre ||
    "Empresa sin identificar"
  );
}

function planDescription(plan?: Plan | null) {
  if (!plan) return "Plan no disponible";
  return plan.descripcion || "Sin descripción";
}

function planHours(plan?: Plan | null) {
  if (!plan) return null;
  const hours: Record<string, number> = {
    essential: 3,
    growth: 6,
    business: 12,
  };
  return hours[plan.code] ?? null;
}

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102A66]/8 text-[#102A66]">
          {icon}
        </div>
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#102A66]">
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
        {icon}
      </div>
      <p className="font-medium text-slate-800">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{text}</p>
    </div>
  );
}

export default function EmployeeMaintenance({
  basePath = "/employee/maintenance",
  onMenuNavigate,
}: Props) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [invoices, setInvoices] = useState<MaintenanceInvoice[]>([]);
  const [contractProjects, setContractProjects] = useState<Relation[]>([]);
  const [projects, setProjects] = useState<AnyRow[]>([]);
  const [projectToAssign, setProjectToAssign] = useState("");
  const [projectAssignmentLoading, setProjectAssignmentLoading] = useState(false);
  const [projectRemovalLoading, setProjectRemovalLoading] = useState<string | null>(null);
  const [customResponseProposalId, setCustomResponseProposalId] = useState<string | null>(null);
  const [customResponseLoading, setCustomResponseLoading] = useState(false);
  const [customResponseStatus, setCustomResponseStatus] = useState<"in_review" | "quoted" | "rejected">("in_review");
  const [customQuote, setCustomQuote] = useState({
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customProposals, setCustomProposals] = useState<AnyRow[]>([]);
  const [companyChangeRequests, setCompanyChangeRequests] = useState<CompanyChangeRequest[]>([]);

  const [proposalDocuments, setProposalDocuments] = useState<ProposalDocument[]>([]);
  const [proposalAcknowledgements, setProposalAcknowledgements] = useState<ProposalAcknowledgement[]>([]);
  const [proposalEvents, setProposalEvents] = useState<ProposalEvent[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [proposalSearch, setProposalSearch] = useState("");
  const [proposalFilter, setProposalFilter] = useState("all");
  const [proposalAction, setProposalAction] = useState<"in_review" | "quoted" | "clarification_requested" | "rejected">("in_review");
  const [proposalActionLoading, setProposalActionLoading] = useState(false);
  const [proposalPdfLoading, setProposalPdfLoading] = useState<string | null>(null);
  const [proposalPdfOpening, setProposalPdfOpening] = useState<string | null>(null);
  const [clarificationMessage, setClarificationMessage] = useState("");
  const [responseNotes, setResponseNotes] = useState("");

  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [invoiceFilter, setInvoiceFilter] = useState("all");
  const [contractFilter, setContractFilter] = useState("all");

  const [uploadingInvoiceId, setUploadingInvoiceId] = useState<string | null>(null);
  const [hashingInvoiceId, setHashingInvoiceId] = useState<string | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);

  const employeeRoot = basePath.replace(/\/maintenance\/?$/, "") || "/employee";

  const go = useCallback(
    (path: string) => {
      setMenuOpen(false);
      setLocation(path);
    },
    [setLocation]
  );

  const navigateFromMenu = useCallback(
    (id: string) => {
      setMenuOpen(false);

      if (onMenuNavigate) {
        onMenuNavigate(id);
        return;
      }

      const map: Record<string, string> = {
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
        maintenance: `${employeeRoot}/maintenance`,
        automations: `${employeeRoot}/automations`,
        automationRuns: `${employeeRoot}/automationRuns`,
      };

      if (map[id]) setLocation(map[id]);
    },
    [employeeRoot, onMenuNavigate, setLocation]
  );

  const loadData = useCallback(
    async (silent = false) => {
      if (!user) return;

      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        /*
         * Los workers tienen SELECT global en las tablas de mantenimiento.
         * No filtramos por company_id porque un worker debe poder gestionar
         * el conjunto completo de MODIRA.
         */
        const [
          plansResult,
          contractsResult,
          contractProjectsResult,
          invoicesResult,
          companiesResult,
          projectsResult,
          paymentsResult,
          proposalsResult,
          fiscalResult,
          proposalDocumentsResult,
          proposalAcknowledgementsResult,
          proposalEventsResult,
        ] = await Promise.all([
          supabase.from("maintenance_plans").select("*").order("precio", { ascending: true, nullsFirst: false }),
          supabase.from("maintenance_contracts").select("*").order("created_at", { ascending: false }),
          supabase.from("maintenance_contract_projects").select("*").order("created_at", { ascending: false }),
          supabase.from("maintenance_invoices").select("*").order("fecha_emision", { ascending: false }),
          supabase.from("companies").select("*").order("company_name", { ascending: true }),
          supabase.from("projects").select("*").order("created_at", { ascending: false }),
          supabase.from("payments").select("*").not("maintenance_invoice_id", "is", null).order("created_at", { ascending: false }),
          supabase.from("maintenance_custom_proposals").select("*").order("created_at", { ascending: false }),
          supabase.from("company_change_requests").select("*").order("created_at", { ascending: false }).limit(500),
          supabase.from("maintenance_custom_proposal_documents").select("*").order("created_at", { ascending: false }),
          supabase.from("maintenance_custom_proposal_document_acknowledgements").select("*").order("accepted_at", { ascending: false }),
          supabase.from("maintenance_custom_proposal_events").select("*").order("created_at", { ascending: false }),
          /*
           * En las versiones actuales del área cliente el flujo de cambios
           * de empresa se ha unificado en company_change_requests. Si esta
           * tabla no existe en una instalación anterior, la página continúa
           * funcionando y el bloque fiscal simplemente queda vacío.
           */
        ]);

        const hardErrors = [
          plansResult,
          contractsResult,
          contractProjectsResult,
          invoicesResult,
          companiesResult,
          projectsResult,
          paymentsResult,
        ].filter((result) => result.error);

        if (hardErrors.length) {
          throw hardErrors[0].error;
        }

        setPlans((plansResult.data || []) as Plan[]);
        setContracts((contractsResult.data || []) as Contract[]);
        setContractProjects((contractProjectsResult.data || []) as Relation[]);
        setInvoices((invoicesResult.data || []) as MaintenanceInvoice[]);
        setCompanies((companiesResult.data || []) as Company[]);
        setProjects(projectsResult.data || []);
        setPayments((paymentsResult.data || []) as Payment[]);

        if (!proposalsResult.error) {
          setCustomProposals(proposalsResult.data || []);
        } else {
          setCustomProposals([]);
          console.warn("[EmployeeMaintenance] Custom proposals unavailable:", proposalsResult.error);
        }

        setProposalDocuments(proposalDocumentsResult.error ? [] : ((proposalDocumentsResult.data || []) as ProposalDocument[]));
        setProposalAcknowledgements(proposalAcknowledgementsResult.error ? [] : ((proposalAcknowledgementsResult.data || []) as ProposalAcknowledgement[]));
        setProposalEvents(proposalEventsResult.error ? [] : ((proposalEventsResult.data || []) as ProposalEvent[]));

        if (!fiscalResult.error) {
          setCompanyChangeRequests((fiscalResult.data || []) as CompanyChangeRequest[]);
        } else {
          setCompanyChangeRequests([]);
          console.warn("[EmployeeMaintenance] company_change_requests unavailable:", fiscalResult.error);
        }
      } catch (err: any) {
        console.error("[EmployeeMaintenance] loadData:", err);
        setError(err?.message || "No se ha podido cargar el área de mantenimiento.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);
  const companyMap = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const contractProjectMap = useMemo(() => {
    const map = new Map<string, Relation[]>();
    for (const relation of contractProjects) {
      const list = map.get(relation.maintenance_contract_id) || [];
      list.push(relation);
      map.set(relation.maintenance_contract_id, list);
    }
    return map;
  }, [contractProjects]);

  const filteredContracts = useMemo(() => {
    const q = normalize(search);

    return contracts.filter((contract) => {
      const company = companyMap.get(contract.company_id);
      const plan = contract.plan_id ? planMap.get(contract.plan_id) : null;
      const haystack = [
        contract.id,
        companyName(company),
        plan?.nombre,
        contract.nombre_plan,
        contract.stripe_subscription_id,
        contract.estado,
      ]
        .map(normalize)
        .join(" ");

      const statusOk =
        contractFilter === "all" ||
        normalize(contract.estado) === normalize(contractFilter);

      return statusOk && (!q || haystack.includes(q));
    });
  }, [contracts, companyMap, contractFilter, planMap, search]);

  const filteredInvoices = useMemo(() => {
    const q = normalize(search);

    return invoices.filter((invoice) => {
      const company = invoice.company_id ? companyMap.get(invoice.company_id) : null;
      const haystack = [
        invoice.id,
        `${invoice.serie}-${invoice.numero}`,
        invoice.descripcion,
        invoice.estado,
        companyName(company),
        invoice.customer_legal_name,
        invoice.customer_tax_id,
        invoice.stripe_invoice_id,
      ]
        .map(normalize)
        .join(" ");

      const stateOk =
        invoiceFilter === "all" ||
        normalize(invoice.estado) === normalize(invoiceFilter);

      return stateOk && (!q || haystack.includes(q));
    });
  }, [companyMap, invoiceFilter, invoices, search]);

  const selectedContract = selectedContractId
    ? contracts.find((contract) => contract.id === selectedContractId) || null
    : null;

  const selectedInvoice = selectedInvoiceId
    ? invoices.find((invoice) => invoice.id === selectedInvoiceId) || null
    : null;

  const activeContracts = useMemo(
    () => contracts.filter((contract) => ["activo", "pausado"].includes(normalize(contract.estado))),
    [contracts]
  );

  const pendingInvoices = useMemo(
    () => invoices.filter((invoice) => ["pendiente", "enviada", "impagada"].includes(normalize(invoice.estado))),
    [invoices]
  );

  const paidInvoices = useMemo(
    () => invoices.filter((invoice) => ["pagada", "pagado"].includes(normalize(invoice.estado))),
    [invoices]
  );

  const totalOutstanding = useMemo(
    () =>
      pendingInvoices.reduce(
        (sum, invoice) => sum + Number(invoice.importe_a_pagar ?? invoice.monto ?? 0),
        0
      ),
    [pendingInvoices]
  );

  const totalCollected = useMemo(
    () =>
      payments
        .filter((payment) =>
          ["paid", "succeeded", "pagado", "pagada", "exito"].includes(
            normalize(payment.status || payment.estado)
          )
        )
        .reduce((sum, payment) => sum + Number(payment.amount ?? payment.monto ?? 0), 0),
    [payments]
  );

  const invoicesWithoutDocument = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          !invoice.document_path &&
          !invoice.pdf_storage_path &&
          !invoice.electronic_document_storage_path
      ),
    [invoices]
  );

  const invoicesWithoutHash = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          invoice.document_path &&
          !invoice.document_sha256
      ),
    [invoices]
  );

  const pendingFiscalRequests = useMemo(
    () => companyChangeRequests.filter((request) => normalize(request.status) === "pending"),
    [companyChangeRequests]
  );

  const openDocument = async (invoice: MaintenanceInvoice) => {
    const path =
      invoice.document_path ||
      invoice.pdf_storage_path ||
      invoice.electronic_document_storage_path ||
      invoice.stripe_pdf_storage_path;

    if (!path) {
      toast.info("Esta factura no tiene ningún documento almacenado.");
      return;
    }

    try {
      setOpeningDocumentId(invoice.id);
      const { data, error: signedError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 10);

      if (signedError) throw signedError;
      if (!data?.signedUrl) throw new Error("No se ha podido generar el enlace seguro.");

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      console.error("[EmployeeMaintenance] openDocument:", err);
      toast.error(err?.message || "No se ha podido abrir el documento.");
    } finally {
      setOpeningDocumentId(null);
    }
  };

  const handleInvoiceFile = async (
    invoice: MaintenanceInvoice,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Solo se permiten documentos PDF.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("El PDF no puede superar 10 MiB.");
      return;
    }

    if (invoice.document_path) {
      toast.error("Esta factura ya tiene un documento Modira asociado. No se sustituye desde esta pantalla.");
      return;
    }

    try {
      setUploadingInvoiceId(invoice.id);

      const path = `${invoice.id}/${crypto.randomUUID()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: attached, error: attachError } = await supabase.rpc(
        "attach_maintenance_invoice_document",
        {
          p_invoice_id: invoice.id,
          p_document_path: path,
        }
      );

      if (attachError) {
        /*
         * El objeto puede quedar huérfano si la RPC rechaza la asociación.
         * No intentamos DELETE aquí porque 050 deliberadamente no concede
         * DELETE de documentos de facturas a authenticated.
         */
        throw attachError;
      }

      setInvoices((current) =>
        current.map((item) =>
          item.id === invoice.id
            ? {
                ...item,
                ...(attached || {}),
              }
            : item
        )
      );

      toast.success("PDF asociado a la factura correctamente.");
      await hashMaintenanceInvoice(invoice.id);
    } catch (err: any) {
      console.error("[EmployeeMaintenance] upload/attach:", err);
      toast.error(err?.message || "No se ha podido asociar el PDF.");
      await loadData(true);
    } finally {
      setUploadingInvoiceId(null);
    }
  };

  const hashMaintenanceInvoice = async (invoiceId: string) => {
    try {
      setHashingInvoiceId(invoiceId);

      const { data, error: invokeError } = await supabase.functions.invoke(
        EDGE_FUNCTION_NAME,
        {
          body: {
            action: "hash_maintenance_invoice_document",
            invoice_id: invoiceId,
          },
        }
      );

      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error || "No se ha podido validar el PDF.");

      toast.success("SHA-256 calculado y registrado correctamente.");
      await loadData(true);
    } catch (err: any) {
      console.error("[EmployeeMaintenance] hash:", err);
      toast.error(err?.message || "No se ha podido registrar la huella digital.");
    } finally {
      setHashingInvoiceId(null);
    }
  };

  const assignProjectToContract = async () => {
    if (!selectedContract || !projectToAssign) return;

    try {
      setProjectAssignmentLoading(true);
      const { error: rpcError } = await supabase.rpc(
        "worker_assign_maintenance_contract_project",
        {
          p_contract_id: selectedContract.id,
          p_project_id: projectToAssign,
        }
      );
      if (rpcError) throw rpcError;
      toast.success("Proyecto asociado al contrato.");
      setProjectToAssign("");
      await loadData(true);
    } catch (err: any) {
      console.error("[EmployeeMaintenance] assign project:", err);
      toast.error(err?.message || "No se ha podido asociar el proyecto.");
    } finally {
      setProjectAssignmentLoading(false);
    }
  };

  const removeProjectFromContract = async (relation: Relation) => {
    if (!selectedContract || !relation.project_id) return;

    try {
      setProjectRemovalLoading(relation.id);
      const { error: rpcError } = await supabase.rpc(
        "worker_unassign_maintenance_contract_project",
        {
          p_contract_id: selectedContract.id,
          p_project_id: relation.project_id,
        }
      );
      if (rpcError) throw rpcError;
      toast.success("Proyecto desasociado del contrato.");
      await loadData(true);
    } catch (err: any) {
      console.error("[EmployeeMaintenance] remove project:", err);
      toast.error(err?.message || "No se ha podido desasociar el proyecto.");
    } finally {
      setProjectRemovalLoading(null);
    }
  };

  const selectedProposal = selectedProposalId
    ? customProposals.find((proposal) => proposal.id === selectedProposalId) || null
    : null;

  const selectedProposalDocuments = useMemo(
    () => proposalDocuments
      .filter((document) => document.proposal_id === selectedProposalId)
      .sort((a, b) => Number(b.version) - Number(a.version)),
    [proposalDocuments, selectedProposalId]
  );

  const selectedProposalEvents = useMemo(
    () => proposalEvents
      .filter((event) => event.proposal_id === selectedProposalId)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
    [proposalEvents, selectedProposalId]
  );

  const selectedProposalAcknowledgements = useMemo(
    () => proposalAcknowledgements
      .filter((ack) => ack.proposal_id === selectedProposalId)
      .sort((a, b) => new Date(b.accepted_at || 0).getTime() - new Date(a.accepted_at || 0).getTime()),
    [proposalAcknowledgements, selectedProposalId]
  );

  const filteredCustomProposals = useMemo(() => {
    const q = normalize(proposalSearch);
    return customProposals.filter((proposal) => {
      const company = companyMap.get(proposal.company_id);
      const status = normalize(proposal.status);
      const statusOk = proposalFilter === "all" || status === normalize(proposalFilter);
      const haystack = [
        proposal.id,
        proposal.titulo,
        companyName(company),
        proposal.status,
        proposal.quoted_monthly_price,
        proposal.maintenance_contract_id,
      ].map(normalize).join(" ");
      return statusOk && (!q || haystack.includes(q));
    });
  }, [companyMap, customProposals, proposalFilter, proposalSearch]);

  const proposalStats = useMemo(() => ({
    pending: customProposals.filter((p) => normalize(p.status) === "submitted").length,
    review: customProposals.filter((p) => normalize(p.status) === "in_review").length,
    clarification: customProposals.filter((p) => normalize(p.status) === "clarification_requested").length,
    quoted: customProposals.filter((p) => normalize(p.status) === "quoted").length,
    activeContracts: contracts.filter((contract) =>
      customProposals.some((proposal) => proposal.id === contract.maintenance_custom_proposal_id) &&
      ["activo", "pausado"].includes(normalize(contract.estado))
    ).length,
  }), [contracts, customProposals]);

  const openCustomResponse = (proposal: AnyRow) => {
    setSelectedProposalId(proposal.id);
    setProposalAction("in_review");
    setClarificationMessage("");
    setResponseNotes(proposal.response_notes || "");
    setCustomQuote({
      monthlyPrice:
        proposal.quoted_monthly_price !== null && proposal.quoted_monthly_price !== undefined
          ? String(proposal.quoted_monthly_price)
          : "",
      hoursMonthly:
        proposal.quoted_hours_monthly !== null && proposal.quoted_hours_monthly !== undefined
          ? String(proposal.quoted_hours_monthly)
          : "",
      scopeLevel: proposal.quoted_scope_level || "",
      serviceLevel: proposal.quoted_service_level || "",
      sla: proposal.quoted_sla || "",
      responseTime: proposal.quoted_response_time || "",
      supportHours: proposal.quoted_support_hours || "",
      description: proposal.quoted_description || "",
      terms: proposal.quoted_terms || "",
      validUntil: proposal.quoted_valid_until ? String(proposal.quoted_valid_until).slice(0, 10) : "",
    });
  };

  const openProposalDocument = async (document: ProposalDocument) => {
    try {
      setProposalPdfOpening(document.id);
      const { data, error: signedError } = await supabase.storage
        .from(PROPOSAL_BUCKET)
        .createSignedUrl(document.document_path, 60 * 10);
      if (signedError) throw signedError;
      if (!data?.signedUrl) throw new Error("No se ha podido generar el enlace seguro al PDF.");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      console.error("[EmployeeMaintenance] open proposal PDF:", err);
      toast.error(err?.message || "No se ha podido abrir el PDF.");
    } finally {
      setProposalPdfOpening(null);
    }
  };

  const handleProposalPdf = async (
    proposal: AnyRow,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Solo se permiten documentos PDF.");
      return;
    }
    if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
      toast.error("El PDF debe pesar más de 0 bytes y no superar 20 MiB.");
      return;
    }

    if (!["submitted", "in_review", "clarification_requested"].includes(normalize(proposal.status))) {
      toast.error("El PDF solo puede prepararse mientras la propuesta está en revisión.");
      return;
    }

    try {
      setProposalPdfLoading(proposal.id);
      const path = `${proposal.id}/${crypto.randomUUID()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from(PROPOSAL_BUCKET)
        .upload(path, file, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) throw uploadError;

      // La huella que finalmente se persiste la calcula y valida el backend.
      // El frontend solo envía el objeto recién subido para que la Edge Function
      // pueda descargarlo, calcular SHA-256 y asociarlo mediante la RPC service_role.
      const { data, error: invokeError } = await supabase.functions.invoke(
        EDGE_FUNCTION_NAME,
        {
          body: {
            action: PROPOSAL_EDGE_ACTION,
            proposal_id: proposal.id,
            document_path: path,
          },
        }
      );
      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error || "No se ha podido registrar el PDF de la propuesta.");

      toast.success(`PDF asociado correctamente como versión ${data.document?.version || "nueva"}.`);
      await loadData(true);
    } catch (err: any) {
      console.error("[EmployeeMaintenance] proposal PDF upload:", err);
      toast.error(err?.message || "No se ha podido asociar el PDF de la propuesta.");
      await loadData(true);
    } finally {
      setProposalPdfLoading(null);
    }
  };

  const reviewCustomProposal = async () => {
    if (!selectedProposal) return;

    if (proposalAction === "quoted") {
      if (!customQuote.monthlyPrice || Number(customQuote.monthlyPrice) <= 0) {
        toast.error("Indica un precio mensual válido.");
        return;
      }
      if (!customQuote.validUntil) {
        toast.error("Indica la fecha de validez de la propuesta.");
        return;
      }
      const currentDocument = proposalDocuments.find(
        (document) => document.id === selectedProposal.current_document_id && document.proposal_id === selectedProposal.id
      );
      if (!currentDocument) {
        toast.error("Debes adjuntar primero el PDF de respuesta de Modira.");
        return;
      }
    }

    if (proposalAction === "clarification_requested" && !clarificationMessage.trim()) {
      toast.error("Indica qué información adicional necesita Modira.");
      return;
    }

    if (proposalAction === "rejected" && !responseNotes.trim()) {
      toast.error("Indica el motivo del rechazo.");
      return;
    }

    try {
      setProposalActionLoading(true);
      const { data, error: rpcError } = await supabase.rpc(
        "review_custom_maintenance_proposal",
        {
          p_proposal_id: selectedProposal.id,
          p_action: proposalAction,
          p_quoted_monthly_price: proposalAction === "quoted" ? Number(customQuote.monthlyPrice) : null,
          p_quoted_currency: proposalAction === "quoted" ? (selectedProposal.quoted_currency || "EUR") : "EUR",
          p_quoted_hours_monthly: proposalAction === "quoted" && customQuote.hoursMonthly ? Number(customQuote.hoursMonthly) : null,
          p_quoted_scope_level: proposalAction === "quoted" ? customQuote.scopeLevel || null : null,
          p_quoted_service_level: proposalAction === "quoted" ? customQuote.serviceLevel || null : null,
          p_quoted_sla: proposalAction === "quoted" ? customQuote.sla || null : null,
          p_quoted_response_time: proposalAction === "quoted" ? customQuote.responseTime || null : null,
          p_quoted_support_hours: proposalAction === "quoted" ? customQuote.supportHours || null : null,
          p_quoted_description: proposalAction === "quoted" ? customQuote.description || null : null,
          p_quoted_terms: proposalAction === "quoted" ? customQuote.terms || null : null,
          p_quoted_valid_until: proposalAction === "quoted" ? customQuote.validUntil : null,
          p_response_notes: responseNotes.trim() || null,
          p_clarification_message: proposalAction === "clarification_requested" ? clarificationMessage.trim() : null,
        }
      );
      if (rpcError) throw rpcError;

      const messages: Record<string, string> = {
        in_review: "La propuesta ha pasado a revisión.",
        quoted: "La propuesta ha sido enviada al cliente.",
        clarification_requested: "Se ha solicitado información adicional al cliente.",
        rejected: "La propuesta ha sido rechazada.",
      };
      toast.success(messages[proposalAction]);
      setSelectedProposalId(null);
      await loadData(true);
    } catch (err: any) {
      console.error("[EmployeeMaintenance] review custom proposal:", err);
      toast.error(err?.message || "No se ha podido actualizar la propuesta.");
    } finally {
      setProposalActionLoading(false);
    }
  };

  const refresh = () => void loadData(true);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f8fb]">
        <div className="flex min-h-screen items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-[#102A66]" />
            Cargando mantenimiento…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-900">
      {/* ================================================================
          NAVEGACIÓN EMPLOYEE
          ================================================================ */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Abrir navegación"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <button
              type="button"
              onClick={() => go(`${employeeRoot}/maintenance`)}
              className="flex items-center gap-2"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#102A66] text-white">
                <Wrench className="h-4 w-4" />
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-semibold text-slate-900">Modira</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Employee Area</p>
              </div>
            </button>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <div className="rounded-full border border-[#102A66]/15 bg-[#102A66]/5 px-3 py-1.5 text-xs font-medium text-[#102A66]">
              Mantenimiento
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <UserRound className="h-4 w-4" />
            </div>
          </div>
        </div>

        {menuOpen && (
          <div className="absolute left-4 top-[4.5rem] z-[60] w-[280px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Employee Area</p>
              <p className="mt-1 text-sm font-medium text-slate-800">Navegación</p>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-2">
              {[
                { id: "dashboard", label: "Dashboard", icon: BriefcaseBusiness },
                { id: "projects", label: "Proyectos", icon: FolderKanban },
                { id: "companies", label: "Empresas", icon: BriefcaseBusiness },
                { id: "quotations", label: "Presupuestos", icon: FileText },
                { id: "billing", label: "Facturación", icon: CreditCard },
                { id: "payments", label: "Pagos", icon: CircleDollarSign },
                { id: "support", label: "Soporte", icon: Wrench },
                { id: "ai", label: "IA", icon: Sparkles },
                { id: "notifications", label: "Notificaciones", icon: Info },
                { id: "activity", label: "Actividad", icon: Clock3 },
                { id: "audits", label: "Auditorías", icon: ShieldCheck },
                { id: "companyChanges", label: "Cambios de empresa", icon: RefreshCw },
                { id: "maintenance", label: "Mantenimiento", icon: Wrench },
                { id: "automations", label: "Automatizaciones", icon: Zap },
                { id: "automationRuns", label: "Ejecuciones", icon: RefreshCw },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigateFromMenu(id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    id === "maintenance"
                      ? "bg-[#102A66]/7 font-medium text-[#102A66]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1500px] px-5 py-7 lg:px-8 lg:py-9">
        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-medium">No se ha podido cargar toda la información.</p>
              <p className="mt-0.5 text-red-600/80">{error}</p>
            </div>
            <button
              type="button"
              onClick={refresh}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-red-50"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* ================================================================
            CABECERA
            ================================================================ */}
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#102A66]">
              Modira Care
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 lg:text-4xl">
              Mantenimiento
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Gestión operativa de planes, contratos, alcance técnico, facturación,
              documentación y estado de mantenimiento de todas las empresas.
            </p>
          </div>

          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        {/* ================================================================
            RESUMEN
            ================================================================ */}
        <div className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard
            icon={<Wrench className="h-5 w-5" />}
            label="Contratos activos"
            value={activeContracts.length}
            detail={`${contracts.length} contratos totales`}
          />
          <StatCard
            icon={<BriefcaseBusiness className="h-5 w-5" />}
            label="Empresas con contratos"
            value={new Set(activeContracts.map((c) => c.company_id)).size}
            detail={`${companies.length} empresas visibles`}
          />
          <StatCard
            icon={<CreditCard className="h-5 w-5" />}
            label="Facturas pendientes"
            value={pendingInvoices.length}
            detail={money(totalOutstanding)}
          />
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Facturas pagadas"
            value={paidInvoices.length}
            detail={money(totalCollected)}
          />
          <StatCard
            icon={<Upload className="h-5 w-5" />}
            label="Sin PDF Modira"
            value={invoicesWithoutDocument.length}
            detail="Requieren documentación"
          />
          <StatCard
            icon={<ShieldCheck className="h-5 w-5" />}
            label="PDF sin hash"
            value={invoicesWithoutHash.length}
            detail="Validación documental pendiente"
          />
        </div>

        {/* ================================================================
            ALERTAS OPERATIVAS
            ================================================================ */}
        {(invoicesWithoutDocument.length > 0 ||
          invoicesWithoutHash.length > 0 ||
          pendingFiscalRequests.length > 0) && (
          <section className="mb-10">
            <SectionTitle
              eyebrow="Atención"
              title="Tareas operativas pendientes"
              description="Elementos que pueden requerir intervención del trabajador."
            />

            <div className="grid gap-4 lg:grid-cols-3">
              {invoicesWithoutDocument.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceFilter("all");
                    document.getElementById("maintenance-invoices")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                  className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left transition hover:bg-amber-100/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Upload className="h-5 w-5 text-amber-700" />
                    <ArrowRight className="h-4 w-4 text-amber-600" />
                  </div>
                  <p className="mt-4 font-semibold text-amber-950">
                    {invoicesWithoutDocument.length} factura(s) sin PDF
                  </p>
                  <p className="mt-1 text-sm text-amber-800/80">
                    Sube y asocia el documento de Modira desde el historial de facturas.
                  </p>
                </button>
              )}

              {invoicesWithoutHash.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setInvoiceFilter("all");
                    document.getElementById("maintenance-invoices")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                  className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-left transition hover:bg-blue-100/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <ShieldCheck className="h-5 w-5 text-[#102A66]" />
                    <ArrowRight className="h-4 w-4 text-[#102A66]" />
                  </div>
                  <p className="mt-4 font-semibold text-slate-900">
                    {invoicesWithoutHash.length} PDF(s) sin SHA-256
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Valida la huella del PDF real con la Edge Function de mantenimiento.
                  </p>
                </button>
              )}

              {pendingFiscalRequests.length > 0 && (
                <button
                  type="button"
                  onClick={() => go(`${employeeRoot}/companyChanges`)}
                  className="rounded-2xl border border-purple-200 bg-purple-50 p-5 text-left transition hover:bg-purple-100/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <RefreshCw className="h-5 w-5 text-purple-700" />
                    <ArrowRight className="h-4 w-4 text-purple-600" />
                  </div>
                  <p className="mt-4 font-semibold text-purple-950">
                    {pendingFiscalRequests.length} solicitud(es) de cambio de empresa
                  </p>
                  <p className="mt-1 text-sm text-purple-800/80">
                    El flujo actual de cambios de empresa se gestiona en su módulo propio.
                  </p>
                </button>
              )}
            </div>
          </section>
        )}

        {/* ================================================================
            PLANES
            ================================================================ */}
        <section className="mb-10">
          <SectionTitle
            eyebrow="Catálogo"
            title="Planes de mantenimiento"
            description="Catálogo completo disponible en public.maintenance_plans. El empleado puede consultar sus condiciones y referencias Stripe, pero las escrituras del catálogo permanecen en backend/service_role."
          />

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const hours = planHours(plan);

              return (
                <article
                  key={plan.id}
                  className={`rounded-2xl border bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)] ${
                    plan.activo ? "border-slate-200" : "border-slate-200 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#102A66]">
                        {plan.code}
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-slate-900">{plan.nombre}</h3>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${plan.activo ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                      {plan.activo ? "Activo" : "Inactivo"}
                    </span>
                  </div>

                  <div className="mt-5">
                    <p className="text-3xl font-semibold tracking-tight text-slate-950">
                      {plan.es_personalizado ? "A medida" : money(plan.precio, plan.moneda)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {plan.es_personalizado ? "Precio acordado por empresa" : `por ${plan.periodicidad}`}
                    </p>
                  </div>

                  <p className="mt-4 min-h-[48px] text-sm leading-5 text-slate-600">
                    {planDescription(plan)}
                  </p>

                  <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                    {hours !== null && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Horas incluidas</span>
                        <span className="font-medium text-slate-800">{hours} h/mes</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Moneda</span>
                      <span className="font-medium text-slate-800">{plan.moneda}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Stripe Price</span>
                      <span className="max-w-[150px] truncate font-mono text-[10px] text-slate-500">
                        {plan.stripe_price_id || "No configurado"}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {plans.length === 0 && (
            <EmptyState
              icon={<Wrench className="h-5 w-5" />}
              title="No hay planes"
              text="No se han encontrado registros en maintenance_plans."
            />
          )}
        </section>

        {/* ================================================================
            CONTRATOS
            ================================================================ */}
        <section className="mb-10" id="maintenance-contracts">
          <SectionTitle
            eyebrow="Contratos"
            title="Contratos de mantenimiento"
            description="Vista global del trabajador: empresa, plan, precio snapshot, periodo, renovación, cancelación, cambios pendientes y referencias Stripe."
          />

          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar empresa, plan, estado, contrato o Stripe…"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-[#102A66]/40"
              />
            </div>
            <select
              value={contractFilter}
              onChange={(event) => setContractFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
            >
              <option value="all">Todos los estados</option>
              <option value="activo">Activo</option>
              <option value="pausado">Pausado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <div className="overflow-x-auto">
              <table className="min-w-[1050px] w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Empresa</th>
                    <th className="px-5 py-3">Plan</th>
                    <th className="px-5 py-3">Precio</th>
                    <th className="px-5 py-3">Periodo</th>
                    <th className="px-5 py-3">Renovación</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredContracts.map((contract) => {
                    const company = companyMap.get(contract.company_id);
                    const plan = contract.plan_id ? planMap.get(contract.plan_id) : null;
                    const projectsCount = contractProjectMap.get(contract.id)?.length || 0;

                    return (
                      <tr key={contract.id} className="align-top hover:bg-slate-50/50">
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">{companyName(company)}</p>
                          <p className="mt-1 font-mono text-[10px] text-slate-400">{contract.company_id}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-800">{plan?.nombre || contract.nombre_plan || "—"}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {projectsCount} proyectos asociados
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-900">
                            {money(contract.agreed_monthly_price ?? contract.precio, contract.moneda || "EUR")}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">snapshot contractual</p>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-600">
                          <p>{date(contract.current_period_start)} → {date(contract.current_period_end)}</p>
                          <p className="mt-1">Día {contract.renewal_day ?? "—"}</p>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-600">
                          {contract.cancel_at_period_end ? (
                            <>
                              <span className="font-medium text-red-700">Cancelación programada</span>
                              <p className="mt-1">Efectiva: {date(contract.cancel_effective_at)}</p>
                            </>
                          ) : contract.pending_plan_id ? (
                            <>
                              <span className="font-medium text-amber-700">Cambio de plan pendiente</span>
                              <p className="mt-1">Efectivo: {date(contract.pending_change_effective_at)}</p>
                            </>
                          ) : (
                            <span className="text-slate-400">Sin cambios pendientes</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(contract.estado)}`}>
                            {labelStatus(contract.estado)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() => setSelectedContractId((current) => current === contract.id ? null : contract.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {selectedContractId === contract.id ? "Cerrar" : "Ver detalle"}
                            {selectedContractId === contract.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredContracts.length === 0 && (
              <EmptyState
                icon={<Wrench className="h-5 w-5" />}
                title="No hay contratos que coincidan"
                text="Prueba a cambiar el filtro o la búsqueda."
              />
            )}
          </div>

          {selectedContract && (
            <div className="mt-4 rounded-2xl border border-[#102A66]/15 bg-white p-6 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
              <div className="flex flex-col gap-5 xl:flex-row xl:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#102A66]">
                    Detalle contractual
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">
                    {companyName(companyMap.get(selectedContract.company_id))}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400 font-mono">{selectedContract.id}</p>
                </div>
                <span className={`h-fit rounded-full border px-3 py-1.5 text-xs font-medium ${statusClass(selectedContract.estado)}`}>
                  {labelStatus(selectedContract.estado)}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Plan", planMap.get(selectedContract.plan_id || "")?.nombre || selectedContract.nombre_plan || "—"],
                  ["Precio acordado", money(selectedContract.agreed_monthly_price ?? selectedContract.precio, selectedContract.moneda || "EUR")],
                  ["Inicio periodo", date(selectedContract.current_period_start)],
                  ["Fin periodo", date(selectedContract.current_period_end)],
                  ["Día renovación", selectedContract.renewal_day ?? "—"],
                  ["Contratado", dateTime(selectedContract.contracted_at || selectedContract.fecha_inicio)],
                  ["Cancelación", selectedContract.cancel_at_period_end ? date(selectedContract.cancel_effective_at) : "No programada"],
                  ["Cambio de plan", selectedContract.pending_plan_id ? `${planMap.get(selectedContract.pending_plan_id)?.nombre || "Pendiente"} · ${date(selectedContract.pending_change_effective_at)}` : "Sin cambio"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Proyectos asociados</h4>
                    <p className="mt-1 text-xs text-slate-500">
                      La relación contrato ↔ proyecto se gestiona mediante RPCs seguras de worker.
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {contractProjectMap.get(selectedContract.id)?.length || 0}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select
                      value={projectToAssign}
                      onChange={(event) => setProjectToAssign(event.target.value)}
                      className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102A66]/40"
                    >
                      <option value="">Seleccionar proyecto de la empresa…</option>
                      {projects
                        .filter((project) => project.company_id === selectedContract.company_id)
                        .filter(
                          (project) =>
                            !(contractProjectMap.get(selectedContract.id) || []).some(
                              (relation) => relation.project_id === project.id
                            )
                        )
                        .map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.nombre || project.name || project.titulo || project.id}
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => void assignProjectToContract()}
                      disabled={!projectToAssign || projectAssignmentLoading}
                      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#102A66] px-3 text-xs font-medium text-white hover:bg-[#0c2254] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {projectAssignmentLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Asociar proyecto
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {(contractProjectMap.get(selectedContract.id) || []).map((relation) => {
                      const project = projectMap.get(relation.project_id || "");
                      return (
                        <div
                          key={relation.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {project?.nombre ||
                                project?.name ||
                                project?.titulo ||
                                project?.descripcion ||
                                relation.project_id ||
                                "Proyecto"}
                            </p>
                            <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
                              {relation.project_id}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => void removeProjectFromContract(relation)}
                            disabled={projectRemovalLoading === relation.id}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                          >
                            {projectRemovalLoading === relation.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Quitar
                          </button>
                        </div>
                      );
                    })}

                    {(contractProjectMap.get(selectedContract.id) || []).length === 0 && (
                      <p className="text-sm text-slate-400">No hay proyectos asociados.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">Fallos de cobro consecutivos</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {selectedContract.billing_failure_count ?? 0}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Último fallo de pago</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {dateTime(selectedContract.last_payment_failed_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Bloqueo de cobro</p>
                  <p className={`mt-1 text-sm font-medium ${selectedContract.billing_blocked_at ? "text-red-700" : "text-emerald-700"}`}>
                    {selectedContract.billing_blocked_at
                      ? `Bloqueado · ${dateTime(selectedContract.billing_blocked_at)}`
                      : "Sin bloqueo"}
                  </p>
                  {selectedContract.billing_block_reason && (
                    <p className="mt-1 text-xs text-slate-500">{selectedContract.billing_block_reason}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">Stripe subscription</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-700">{selectedContract.stripe_subscription_id || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">Stripe price</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-700">{selectedContract.stripe_price_id || "—"}</p>
                </div>
              </div>

              {selectedContract.plan_snapshot && (
                <details className="mt-5 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    Ver snapshot comercial almacenado
                  </summary>
                  <pre className="mt-3 overflow-auto text-[11px] leading-5 text-slate-500">
                    {JSON.stringify(selectedContract.plan_snapshot, null, 2)}
                  </pre>
                </details>
              )}

              {selectedContract.scope_snapshot && (
                <details className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    Ver snapshot de alcance
                  </summary>
                  <pre className="mt-3 overflow-auto text-[11px] leading-5 text-slate-500">
                    {JSON.stringify(selectedContract.scope_snapshot, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </section>

        {/* ================================================================
            FACTURAS + DOCUMENTOS
            ================================================================ */}
        <section className="mb-10" id="maintenance-invoices">
          <SectionTitle
            eyebrow="Billing"
            title="Facturas de mantenimiento"
            description="Histórico fiscal independiente de public.invoices. Las facturas son registros históricos y no se eliminan desde el área autenticada."
          />

          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar factura, empresa, NIF, Stripe o descripción…"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-[#102A66]/40"
              />
            </div>
            <select
              value={invoiceFilter}
              onChange={(event) => setInvoiceFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
            >
              <option value="all">Todos los estados</option>
              <option value="borrador">Borrador</option>
              <option value="pendiente">Pendiente</option>
              <option value="enviada">Enviada</option>
              <option value="pagada">Pagada</option>
              <option value="impagada">Impagada</option>
              <option value="anulada">Anulada</option>
              <option value="rectificada">Rectificada</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <div className="overflow-x-auto">
              <table className="min-w-[1350px] w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Factura</th>
                    <th className="px-5 py-3">Empresa / cliente</th>
                    <th className="px-5 py-3">Periodo</th>
                    <th className="px-5 py-3">Importe</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3">Documento</th>
                    <th className="px-5 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInvoices.map((invoice) => {
                    const company = invoice.company_id ? companyMap.get(invoice.company_id) : null;
                    const hasModiraDocument = Boolean(invoice.document_path);
                    const hasHash = Boolean(invoice.document_sha256);
                    const hasAnyDocument = Boolean(
                      invoice.document_path ||
                      invoice.pdf_storage_path ||
                      invoice.electronic_document_storage_path ||
                      invoice.stripe_pdf_storage_path
                    );

                    return (
                      <tr key={invoice.id} className="align-top hover:bg-slate-50/50">
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">
                            {invoice.serie}-{invoice.numero}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">Emisión: {date(invoice.fecha_emision)}</p>
                          <p className="mt-1 font-mono text-[10px] text-slate-400">{invoice.id}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-800">
                            {companyName(company) !== "Empresa sin identificar"
                              ? companyName(company)
                              : invoice.customer_legal_name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">{invoice.customer_tax_id}</p>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-600">
                          {date(invoice.periodo_inicio)} → {date(invoice.periodo_fin)}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-900">
                            {money(invoice.importe_a_pagar, invoice.moneda)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Base {money(invoice.subtotal, invoice.moneda)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(invoice.estado)}`}>
                            {labelStatus(invoice.estado)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="space-y-1.5 text-xs">
                            <div className="flex items-center gap-2">
                              <span className={hasModiraDocument ? "text-emerald-700" : "text-amber-700"}>
                                {hasModiraDocument ? "PDF Modira asociado" : "Sin PDF Modira"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={hasHash ? "text-emerald-700" : "text-slate-400"}>
                                {hasHash ? "SHA-256 validado" : "SHA-256 pendiente"}
                              </span>
                            </div>
                            {invoice.document_file_size && (
                              <p className="text-[10px] text-slate-400">
                                {(Number(invoice.document_file_size) / 1024 / 1024).toFixed(2)} MiB
                              </p>
                            )}
                            {hasAnyDocument && !hasModiraDocument && (
                              <p className="text-[10px] text-slate-400">
                                Existe documento auxiliar/Stripe
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            {hasAnyDocument && (
                              <button
                                type="button"
                                onClick={() => void openDocument(invoice)}
                                disabled={openingDocumentId === invoice.id}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              >
                                {openingDocumentId === invoice.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ExternalLink className="h-3.5 w-3.5" />
                                )}
                                Ver PDF
                              </button>
                            )}

                            {!hasModiraDocument && (
                              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#102A66] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#0c2254]">
                                {uploadingInvoiceId === invoice.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Upload className="h-3.5 w-3.5" />
                                )}
                                Subir PDF
                                <input
                                  type="file"
                                  accept="application/pdf,.pdf"
                                  className="hidden"
                                  disabled={uploadingInvoiceId === invoice.id}
                                  onChange={(event) => void handleInvoiceFile(invoice, event)}
                                />
                              </label>
                            )}

                            {hasModiraDocument && !hasHash && (
                              <button
                                type="button"
                                onClick={() => void hashMaintenanceInvoice(invoice.id)}
                                disabled={hashingInvoiceId === invoice.id}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#102A66]/20 bg-[#102A66]/5 px-3 py-2 text-xs font-medium text-[#102A66] hover:bg-[#102A66]/10 disabled:opacity-60"
                              >
                                {hashingInvoiceId === invoice.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                )}
                                Validar PDF
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setSelectedInvoiceId((current) => current === invoice.id ? null : invoice.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {selectedInvoiceId === invoice.id ? "Cerrar" : "Detalle"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredInvoices.length === 0 && (
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title="No hay facturas que coincidan"
                text="No hay facturas con los filtros actuales."
              />
            )}
          </div>

          {selectedInvoice && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#102A66]">
                    Detalle de factura
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">
                    {selectedInvoice.serie}-{selectedInvoice.numero}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">{selectedInvoice.descripcion}</p>
                </div>
                <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-medium ${statusClass(selectedInvoice.estado)}`}>
                  {labelStatus(selectedInvoice.estado)}
                </span>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Cliente", selectedInvoice.customer_legal_name],
                  ["NIF/CIF/VAT", selectedInvoice.customer_tax_id],
                  ["Base imponible", money(selectedInvoice.subtotal, selectedInvoice.moneda)],
                  ["IVA", `${Number(selectedInvoice.iva_porcentaje || 0).toFixed(2)}% · ${money(selectedInvoice.iva_importe, selectedInvoice.moneda)}`],
                  ["IRPF", selectedInvoice.irpf_aplicado ? `${Number(selectedInvoice.irpf_porcentaje || 0).toFixed(2)}% · ${money(selectedInvoice.irpf_importe, selectedInvoice.moneda)}` : "No aplicado"],
                  ["Importe a pagar", money(selectedInvoice.importe_a_pagar, selectedInvoice.moneda)],
                  ["Fecha emisión", date(selectedInvoice.fecha_emision)],
                  ["Vencimiento", date(selectedInvoice.fecha_vencimiento)],
                  ["Fecha pago", date(selectedInvoice.fecha_pago)],
                  ["Stripe invoice", selectedInvoice.stripe_invoice_id || "—"],
                  ["Stripe customer", selectedInvoice.stripe_customer_id || "—"],
                  ["Formato electrónico", selectedInvoice.electronic_format || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 break-words text-sm font-medium text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-xs font-medium text-slate-500">Documento Modira</p>
                  <p className="mt-2 break-all font-mono text-[11px] text-slate-600">
                    {selectedInvoice.document_path || "No asociado"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${selectedInvoice.document_path ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                      {selectedInvoice.document_path ? "Asociado" : "Pendiente"}
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${selectedInvoice.document_sha256 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`}>
                      {selectedInvoice.document_sha256 ? "Hash validado" : "Hash pendiente"}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                  <p className="text-xs font-medium text-slate-500">SHA-256</p>
                  <p className="mt-2 break-all font-mono text-[11px] text-slate-600">
                    {selectedInvoice.document_sha256 || "—"}
                  </p>
                  <p className="mt-3 text-xs text-slate-400">
                    La huella se calcula sobre el PDF real de Storage mediante la Edge Function.
                  </p>
                </div>
              </div>

              <details className="mt-5 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">
                  Ver snapshot fiscal conservado en la factura
                </summary>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {[
                    ["Razón social", selectedInvoice.customer_legal_name],
                    ["NIF/CIF/VAT", selectedInvoice.customer_tax_id],
                    ["Dirección", selectedInvoice.customer_address],
                    ["Código postal", selectedInvoice.customer_postal_code],
                    ["Ciudad", selectedInvoice.customer_city],
                    ["Provincia", selectedInvoice.customer_province],
                    ["País", selectedInvoice.customer_country],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-[11px] text-slate-400">{label}</p>
                      <p className="text-sm text-slate-700">{value || "—"}</p>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </section>

        {/* ================================================================
            PAYMENTS
            ================================================================ */}
        <section className="mb-10">
          <SectionTitle
            eyebrow="Cobros"
            title="Payments vinculados a mantenimiento"
            description="payments.maintenance_invoice_id permite separar los cobros de mantenimiento de las facturas de servicios."
          />

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Payment</th>
                    <th className="px-5 py-3">Factura mantenimiento</th>
                    <th className="px-5 py-3">Empresa</th>
                    <th className="px-5 py-3">Importe</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.map((payment) => {
                    const invoice = invoices.find((item) => item.id === payment.maintenance_invoice_id);
                    const company = payment.company_id ? companyMap.get(payment.company_id) : null;

                    return (
                      <tr key={payment.id} className="hover:bg-slate-50/50">
                        <td className="px-5 py-4 font-mono text-xs text-slate-500">{payment.id}</td>
                        <td className="px-5 py-4 font-medium text-slate-800">
                          {invoice ? `${invoice.serie}-${invoice.numero}` : payment.maintenance_invoice_id || "—"}
                        </td>
                        <td className="px-5 py-4 text-slate-700">{companyName(company)}</td>
                        <td className="px-5 py-4 font-semibold text-slate-900">
                          {money(payment.amount ?? payment.monto, invoice?.moneda || "EUR")}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(payment.status || payment.estado)}`}>
                            {labelStatus(payment.status || payment.estado)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">{dateTime(payment.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {payments.length === 0 && (
              <EmptyState
                icon={<CircleDollarSign className="h-5 w-5" />}
                title="Sin payments de mantenimiento"
                text="Todavía no hay pagos vinculados mediante maintenance_invoice_id."
              />
            )}
          </div>
        </section>

        {/* ================================================================
            CUSTOM PROPOSALS
            ================================================================ */}
        <section className="mb-10" id="maintenance-custom-proposals">
          <SectionTitle
            eyebrow="Workflow operativo"
            title="Propuestas personalizadas"
            description="Centro de gestión de solicitudes Custom. El worker revisa la petición del cliente, puede pedir aclaraciones, preparar la oferta, publicar su PDF y enviarla. La aceptación contractual siempre corresponde al cliente."
            action={
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Actualizar propuestas
              </button>
            }
          />

          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard icon={<Clock3 className="h-5 w-5" />} label="Pendientes" value={proposalStats.pending} detail="Esperando revisión" />
            <StatCard icon={<FileCheck2 className="h-5 w-5" />} label="En revisión" value={proposalStats.review} detail="Trabajo del empleado" />
            <StatCard icon={<Info className="h-5 w-5" />} label="Esperando información" value={proposalStats.clarification} detail="Respuesta del cliente" />
            <StatCard icon={<CircleDollarSign className="h-5 w-5" />} label="Propuestas enviadas" value={proposalStats.quoted} detail="Pendientes de cliente" />
            <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Contratos activos" value={proposalStats.activeContracts} detail="Originados en Custom" />
          </div>

          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={proposalSearch}
                onChange={(event) => setProposalSearch(event.target.value)}
                placeholder="Buscar propuesta, empresa, estado o contrato…"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-[#102A66]/40"
              />
            </div>
            <select
              value={proposalFilter}
              onChange={(event) => setProposalFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
            >
              <option value="all">Todos los estados</option>
              <option value="submitted">Pendiente</option>
              <option value="in_review">En revisión</option>
              <option value="clarification_requested">Esperando información</option>
              <option value="quoted">Propuesta enviada</option>
              <option value="accepted">Aceptada</option>
              <option value="rejected">Rechazada</option>
              <option value="cancelled">Cancelada</option>
              <option value="expired">Caducada</option>
            </select>
          </div>

          {filteredCustomProposals.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="h-5 w-5" />}
              title="No hay propuestas Custom que coincidan"
              text="No hay solicitudes con los filtros actuales o la tabla todavía no contiene propuestas."
            />
          ) : (
            <div className="space-y-4">
              {filteredCustomProposals.map((proposal) => {
                const status = normalize(proposal.status);
                const company = companyMap.get(proposal.company_id);
                const docs = proposalDocuments
                  .filter((document) => document.proposal_id === proposal.id)
                  .sort((a, b) => Number(b.version) - Number(a.version));
                const currentDocument = docs.find((document) => document.id === proposal.current_document_id) || null;
                const currentAck = currentDocument
                  ? proposalAcknowledgements.find(
                      (ack) => ack.proposal_id === proposal.id && ack.document_id === currentDocument.id
                    )
                  : null;
                const contract = contracts.find((item) => item.maintenance_custom_proposal_id === proposal.id);
                const open = selectedProposalId === proposal.id;

                return (
                  <article key={proposal.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
                    <div className="p-5 lg:p-6">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#102A66]">Custom</span>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusClass(proposal.status)}`}>
                              {labelStatus(proposal.status)}
                            </span>
                            {currentDocument && (
                              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                                PDF v{currentDocument.version}
                              </span>
                            )}
                            {currentAck && (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                                PDF leído por cliente
                              </span>
                            )}
                          </div>
                          <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">{proposal.titulo || "Propuesta personalizada"}</h3>
                          <p className="mt-1 text-sm text-slate-500">{companyName(company)}</p>
                          <p className="mt-1 break-all font-mono text-[10px] text-slate-400">{proposal.id}</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {status === "submitted" && (
                            <button
                              type="button"
                              onClick={() => openCustomResponse(proposal)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#102A66] px-3 py-2 text-xs font-medium text-white hover:bg-[#0c2254]"
                            >
                              <FileCheck2 className="h-3.5 w-3.5" />
                              Revisar solicitud
                            </button>
                          )}
                          {status === "in_review" && (
                            <button
                              type="button"
                              onClick={() => openCustomResponse(proposal)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#102A66] px-3 py-2 text-xs font-medium text-white hover:bg-[#0c2254]"
                            >
                              <FileCheck2 className="h-3.5 w-3.5" />
                              Continuar revisión
                            </button>
                          )}
                          {status === "clarification_requested" && (
                            <button
                              type="button"
                              onClick={() => openCustomResponse(proposal)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100"
                            >
                              <Info className="h-3.5 w-3.5" />
                              Ver aclaración
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedProposalId((current) => current === proposal.id ? null : proposal.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            {open ? "Cerrar detalle" : "Ver detalle"}
                            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <div>
                          <p className="text-xs text-slate-400">Solicitada</p>
                          <p className="mt-1 text-sm font-medium text-slate-800">{date(proposal.created_at)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Precio mensual</p>
                          <p className="mt-1 text-sm font-semibold text-slate-900">
                            {proposal.quoted_monthly_price !== null && proposal.quoted_monthly_price !== undefined
                              ? money(proposal.quoted_monthly_price, proposal.quoted_currency || "EUR")
                              : "Pendiente"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Horas/mes</p>
                          <p className="mt-1 text-sm text-slate-700">{proposal.quoted_hours_monthly ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">PDF actual</p>
                          <p className="mt-1 text-sm text-slate-700">{currentDocument ? `v${currentDocument.version}` : "No adjunto"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Contrato</p>
                          <p className="mt-1 text-sm text-slate-700">{contract?.id ? "Creado" : "Pendiente"}</p>
                        </div>
                      </div>
                    </div>

                    {open && (
                      <div className="border-t border-slate-100 bg-slate-50/50 p-5 lg:p-6">
                        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                          <div className="space-y-5">
                            <div className="rounded-2xl border border-slate-200 bg-white p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#102A66]">Solicitud del cliente</p>
                                  <h4 className="mt-1 text-base font-semibold text-slate-900">Información recibida</h4>
                                  <p className="mt-1 text-xs text-slate-500">Estos datos son la solicitud original y no deben confundirse con la oferta de Modira.</p>
                                </div>
                                {proposal.horas_mensuales_solicitadas !== null && proposal.horas_mensuales_solicitadas !== undefined && (
                                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600">
                                    {proposal.horas_mensuales_solicitadas} h/mes solicitadas
                                  </span>
                                )}
                              </div>
                              <div className="mt-5 space-y-4">
                                {[
                                  ["Necesidad", proposal.descripcion_necesidad],
                                  ["Objetivos", proposal.objetivos],
                                  ["Prioridades", proposal.prioridades],
                                  ["Soluciones actuales", proposal.soluciones_actuales],
                                  ["Proyectos relacionados", proposal.proyectos_relacionados],
                                  ["Automatizaciones actuales", proposal.automatizaciones_actuales],
                                  ["Integraciones actuales", proposal.integraciones_actuales],
                                  ["Tecnologías", proposal.tecnologias],
                                  ["Sistemas críticos", proposal.sistemas_criticos],
                                  ["Alcance técnico solicitado", proposal.alcance_tecnico_solicitado],
                                  ["Tipo de trabajo", proposal.tipo_trabajo],
                                  ["Nivel de soporte solicitado", proposal.nivel_soporte_solicitado],
                                  ["Tiempo de respuesta deseado", proposal.tiempo_respuesta_deseado],
                                  ["Horario de soporte", proposal.horario_soporte],
                                  ["Soporte fuera de horario", proposal.soporte_fuera_horario === true ? "Sí" : proposal.soporte_fuera_horario === false ? "No" : null],
                                  ["SLA solicitado", proposal.sla_solicitado],
                                  ["Nivel de criticidad", proposal.nivel_criticidad],
                                  ["Impacto de incidencia", proposal.impacto_incidencia],
                                  ["Necesidad de monitorización", proposal.necesidad_monitorizacion === true ? "Sí" : proposal.necesidad_monitorizacion === false ? "No" : null],
                                  ["Requisitos de seguridad", proposal.requisitos_seguridad],
                                  ["Información adicional", proposal.informacion_adicional],
                                ].filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "").map(([label, value]) => (
                                  <div key={String(label)} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                                    <p className="text-xs font-medium text-slate-500">{label}</p>
                                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{String(value)}</p>
                                  </div>
                                ))}
                                {proposal.request_data && Object.keys(proposal.request_data).length > 0 && (
                                  <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <summary className="cursor-pointer text-xs font-medium text-slate-600">Datos adicionales de la solicitud</summary>
                                    <pre className="mt-3 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-slate-500">{JSON.stringify(proposal.request_data, null, 2)}</pre>
                                  </details>
                                )}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#102A66]">Documentación</p>
                                  <h4 className="mt-1 text-base font-semibold text-slate-900">PDF de respuesta de Modira</h4>
                                  <p className="mt-1 text-xs text-slate-500">Cada subida genera una nueva versión. La huella SHA-256 la fija el backend.</p>
                                </div>
                                {["submitted", "in_review", "clarification_requested"].includes(status) && (
                                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#102A66] px-3 py-2 text-xs font-medium text-white hover:bg-[#0c2254]">
                                    {proposalPdfLoading === proposal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                                    Subir PDF
                                    <input
                                      type="file"
                                      accept="application/pdf,.pdf"
                                      className="hidden"
                                      disabled={proposalPdfLoading === proposal.id}
                                      onChange={(event) => void handleProposalPdf(proposal, event)}
                                    />
                                  </label>
                                )}
                              </div>

                              <div className="mt-4 space-y-2">
                                {docs.length === 0 ? (
                                  <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">Todavía no hay ningún PDF asociado.</p>
                                ) : docs.map((document) => {
                                  const ack = proposalAcknowledgements.find((item) => item.proposal_id === proposal.id && item.document_id === document.id);
                                  const isCurrent = document.id === proposal.current_document_id;
                                  return (
                                    <div key={document.id} className={`rounded-xl border p-4 ${isCurrent ? "border-[#102A66]/20 bg-[#102A66]/[0.025]" : "border-slate-100 bg-slate-50/60"}`}>
                                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-sm font-semibold text-slate-900">Versión {document.version}</span>
                                            {isCurrent && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">Actual</span>}
                                            {document.published_at && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Publicada</span>}
                                            {ack && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Cliente la ha leído</span>}
                                          </div>
                                          <p className="mt-1 break-all font-mono text-[10px] text-slate-400">{document.document_path}</p>
                                          <p className="mt-2 break-all font-mono text-[10px] text-slate-500">SHA-256: {document.document_sha256}</p>
                                          <p className="mt-1 text-[11px] text-slate-400">Subido: {dateTime(document.document_uploaded_at)}{document.document_file_size ? ` · ${(Number(document.document_file_size) / 1024 / 1024).toFixed(2)} MiB` : ""}</p>
                                          {ack && <p className="mt-1 text-[11px] text-emerald-700">Acknowledgement: {dateTime(ack.accepted_at)}</p>}
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => void openProposalDocument(document)}
                                          disabled={proposalPdfOpening === document.id}
                                          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                        >
                                          {proposalPdfOpening === document.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                                          Ver PDF
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-5">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#102A66]">Trazabilidad</p>
                                  <h4 className="mt-1 text-base font-semibold text-slate-900">Historial de la propuesta</h4>
                                </div>
                                <span className="text-xs text-slate-400">{selectedProposalEvents.length} eventos</span>
                              </div>
                              <div className="mt-4 space-y-3">
                                {selectedProposalEvents.length === 0 ? (
                                  <p className="text-sm text-slate-400">No hay eventos registrados todavía.</p>
                                ) : selectedProposalEvents.map((event) => (
                                  <div key={event.id} className="flex gap-3 border-l-2 border-slate-200 pl-4">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-slate-800">{event.event_type}</p>
                                      <p className="mt-0.5 text-xs leading-5 text-slate-500">{event.notes || "Sin detalle adicional."}</p>
                                      <p className="mt-1 text-[10px] text-slate-400">{dateTime(event.created_at)} · {event.actor_type}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="space-y-5">
                            <div className="rounded-2xl border border-[#102A66]/15 bg-white p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#102A66]">Respuesta de Modira</p>
                                  <h4 className="mt-1 text-base font-semibold text-slate-900">Gestión del trabajador</h4>
                                  <p className="mt-1 text-xs text-slate-500">El worker no puede aceptar la propuesta. Solo la revisa, solicita información, rechaza o envía una oferta.</p>
                                </div>
                                {proposal.quoted_by && <span className="text-[10px] text-slate-400">Cotizada</span>}
                              </div>

                              {status === "quoted" || status === "accepted" ? (
                                <div className="mt-5 space-y-4">
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    {[
                                      ["Precio mensual", proposal.quoted_monthly_price != null ? money(proposal.quoted_monthly_price, proposal.quoted_currency || "EUR") : "—"],
                                      ["Horas mensuales", proposal.quoted_hours_monthly ?? "—"],
                                      ["Nivel de alcance", proposal.quoted_scope_level || "—"],
                                      ["Nivel de servicio", proposal.quoted_service_level || "—"],
                                      ["SLA", proposal.quoted_sla || "—"],
                                      ["Tiempo de respuesta", proposal.quoted_response_time || "—"],
                                      ["Horario de soporte", proposal.quoted_support_hours || "—"],
                                      ["Válida hasta", date(proposal.quoted_valid_until)],
                                    ].map(([label, value]) => (
                                      <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                                        <p className="text-[11px] text-slate-500">{label}</p>
                                        <p className="mt-1 text-sm font-medium text-slate-900">{String(value)}</p>
                                      </div>
                                    ))}
                                  </div>
                                  {proposal.quoted_description && (
                                    <div className="border-t border-slate-100 pt-4">
                                      <p className="text-xs font-medium text-slate-500">Descripción de la oferta</p>
                                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{proposal.quoted_description}</p>
                                    </div>
                                  )}
                                  {proposal.quoted_terms && (
                                    <div>
                                      <p className="text-xs font-medium text-slate-500">Condiciones</p>
                                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{proposal.quoted_terms}</p>
                                    </div>
                                  )}
                                  {proposal.response_notes && (
                                    <div>
                                      <p className="text-xs font-medium text-slate-500">Notas internas de respuesta</p>
                                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{proposal.response_notes}</p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="mt-5 space-y-4">
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    {[
                                      ["Precio mensual *", "monthlyPrice", "number"],
                                      ["Horas mensuales", "hoursMonthly", "number"],
                                      ["Nivel de alcance", "scopeLevel", "text"],
                                      ["Nivel de servicio", "serviceLevel", "text"],
                                      ["SLA", "sla", "text"],
                                      ["Tiempo de respuesta", "responseTime", "text"],
                                      ["Horario de soporte", "supportHours", "text"],
                                      ["Válida hasta *", "validUntil", "date"],
                                    ].map(([label, key, type]) => (
                                      <div key={key}>
                                        <label className="text-xs font-medium text-slate-500">{label}</label>
                                        <input
                                          type={type}
                                          min={type === "number" ? "0" : undefined}
                                          max={key === "hoursMonthly" ? "744" : undefined}
                                          step={key === "monthlyPrice" || key === "hoursMonthly" ? "0.01" : undefined}
                                          value={customQuote[key as keyof typeof customQuote]}
                                          onChange={(event) => setCustomQuote((current) => ({ ...current, [key]: event.target.value }))}
                                          className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#102A66]/40"
                                        />
                                      </div>
                                    ))}
                                  </div>

                                  <div>
                                    <label className="text-xs font-medium text-slate-500">Descripción de la oferta</label>
                                    <textarea rows={4} value={customQuote.description} onChange={(event) => setCustomQuote((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#102A66]/40" />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-slate-500">Condiciones comerciales</label>
                                    <textarea rows={4} value={customQuote.terms} onChange={(event) => setCustomQuote((current) => ({ ...current, terms: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#102A66]/40" />
                                  </div>

                                  <div>
                                    <label className="text-xs font-medium text-slate-500">Notas de respuesta</label>
                                    <textarea rows={3} value={responseNotes} onChange={(event) => setResponseNotes(event.target.value)} placeholder="Notas internas o contexto para el cliente cuando proceda…" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#102A66]/40" />
                                  </div>

                                  <div>
                                    <label className="text-xs font-medium text-slate-500">Acción</label>
                                    <select value={proposalAction} onChange={(event) => setProposalAction(event.target.value as typeof proposalAction)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none">
                                      <option value="in_review">Comenzar / continuar revisión</option>
                                      <option value="quoted">Enviar propuesta cotizada</option>
                                      <option value="clarification_requested">Solicitar información adicional</option>
                                      <option value="rejected">Rechazar propuesta</option>
                                    </select>
                                  </div>

                                  {proposalAction === "clarification_requested" && (
                                    <div>
                                      <label className="text-xs font-medium text-slate-500">Qué información necesitamos *</label>
                                      <textarea rows={5} value={clarificationMessage} onChange={(event) => setClarificationMessage(event.target.value)} placeholder="Explica de forma clara qué debe aportar el cliente…" className="mt-1 w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm outline-none focus:border-amber-400" />
                                    </div>
                                  )}

                                  {proposalAction === "quoted" && (
                                    <div className={`rounded-xl border p-4 ${currentDocument ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/70"}`}>
                                      <div className="flex items-start gap-3">
                                        {currentDocument ? <FileCheck2 className="mt-0.5 h-4 w-4 text-emerald-700" /> : <AlertCircle className="mt-0.5 h-4 w-4 text-amber-700" />}
                                        <div>
                                          <p className={`text-xs font-semibold ${currentDocument ? "text-emerald-800" : "text-amber-900"}`}>{currentDocument ? `PDF listo · versión ${currentDocument.version}` : "PDF obligatorio"}</p>
                                          <p className="mt-1 text-xs leading-5 text-slate-600">Para enviar una propuesta cotizada, la base de datos exige un PDF asociado con SHA-256. El cliente deberá revisarlo antes de aceptar.</p>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {proposalAction === "rejected" && (
                                    <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-xs text-red-800">El motivo indicado en «Notas de respuesta» se conservará como motivo del rechazo.</div>
                                  )}

                                  <div className="flex flex-wrap justify-end gap-2 pt-2">
                                    <button type="button" onClick={() => setSelectedProposalId(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Cerrar</button>
                                    <button type="button" onClick={() => void reviewCustomProposal()} disabled={proposalActionLoading} className="inline-flex items-center gap-1.5 rounded-lg bg-[#102A66] px-3 py-2 text-xs font-medium text-white hover:bg-[#0c2254] disabled:opacity-60">
                                      {proposalActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                      {proposalAction === "quoted" ? "Enviar propuesta" : proposalAction === "clarification_requested" ? "Solicitar información" : proposalAction === "rejected" ? "Rechazar" : "Comenzar revisión"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-5">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#102A66]">Aceptación documental</p>
                              <h4 className="mt-1 text-base font-semibold text-slate-900">Estado del PDF frente al cliente</h4>
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                                  <p className="text-xs text-slate-500">PDF actual</p>
                                  <p className="mt-1 text-sm font-medium text-slate-900">{currentDocument ? `Versión ${currentDocument.version}` : "No publicado"}</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                                  <p className="text-xs text-slate-500">Acknowledgement</p>
                                  <p className={`mt-1 text-sm font-medium ${currentAck ? "text-emerald-700" : "text-slate-700"}`}>{currentAck ? `Leído · ${dateTime(currentAck.accepted_at)}` : "Pendiente"}</p>
                                </div>
                              </div>
                              {proposal.status === "accepted" && (
                                <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-800">La propuesta ha sido aceptada por el cliente. Esta pantalla no contiene ninguna acción para volver a aceptar o modificar contractualmente la propuesta.</p>
                              )}
                            </div>

                            {contract && (
                              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#102A66]">Resultado contractual</p>
                                <h4 className="mt-1 text-base font-semibold text-slate-900">Contrato generado</h4>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                  <div><p className="text-xs text-slate-500">Estado</p><p className="mt-1 text-sm font-medium text-slate-900">{labelStatus(contract.estado)}</p></div>
                                  <div><p className="text-xs text-slate-500">Precio acordado</p><p className="mt-1 text-sm font-semibold text-slate-900">{money(contract.agreed_monthly_price ?? contract.precio, contract.moneda || "EUR")}</p></div>
                                  <div><p className="text-xs text-slate-500">Inicio</p><p className="mt-1 text-sm text-slate-700">{date(contract.fecha_inicio)}</p></div>
                                  <div><p className="text-xs text-slate-500">Stripe</p><p className="mt-1 break-all font-mono text-[10px] text-slate-500">{contract.stripe_subscription_id || "—"}</p></div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ================================================================
            DATOS FISCALES / EMPRESAS
            ================================================================ */}
        <section className="mb-10">
          <SectionTitle
            eyebrow="Fiscal"
            title="Estado fiscal de empresas con mantenimiento"
            description="La migración 051 exige datos fiscales mínimos antes de emitir una factura de mantenimiento y conserva el snapshot fiscal dentro de maintenance_invoices."
          />

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
            <div className="overflow-x-auto">
              <table className="min-w-[1050px] w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Empresa</th>
                    <th className="px-5 py-3">NIF/CIF/VAT</th>
                    <th className="px-5 py-3">Dirección</th>
                    <th className="px-5 py-3">Localidad</th>
                    <th className="px-5 py-3">Datos mínimos</th>
                    <th className="px-5 py-3">Solicitud actual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies
                    .filter((company) =>
                      contracts.some((contract) => contract.company_id === company.id)
                    )
                    .map((company) => {
                      const complete =
                        Boolean((company.legal_name || company.company_name)?.trim()) &&
                        Boolean(company.cif_vat?.trim()) &&
                        Boolean(company.address?.trim()) &&
                        Boolean(company.postal_code?.trim()) &&
                        Boolean(company.city?.trim()) &&
                        Boolean(company.country?.trim());

                      const request = companyChangeRequests
                        .filter((item) => item.company_id === company.id)
                        .sort(
                          (a, b) =>
                            new Date(b.created_at || b.requested_at || 0).getTime() -
                            new Date(a.created_at || a.requested_at || 0).getTime()
                        )[0];

                      return (
                        <tr key={company.id} className="hover:bg-slate-50/50">
                          <td className="px-5 py-4 font-medium text-slate-900">{companyName(company)}</td>
                          <td className="px-5 py-4 text-slate-700">{company.cif_vat || "—"}</td>
                          <td className="px-5 py-4 text-xs text-slate-600">
                            {company.address || "—"} · {company.postal_code || "—"}
                          </td>
                          <td className="px-5 py-4 text-slate-600">
                            {company.city || "—"}{company.province ? `, ${company.province}` : ""}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                              {complete ? "Completo" : "Incompleto"}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            {request ? (
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(request.status)}`}>
                                {labelStatus(request.status)}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Sin solicitud</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ================================================================
            MATRIZ DE CAPACIDADES / SEGURIDAD
            ================================================================ */}
        <section className="mb-4">
          <SectionTitle
            eyebrow="Control"
            title="Capacidades del área de empleado"
            description="Resumen de qué operaciones expone realmente la arquitectura actual y por qué algunas acciones no aparecen como botones de escritura."
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                icon: <FileCheck2 className="h-5 w-5" />,
                title: "Lectura global",
                text: "Planes, contratos, proyectos asociados, facturas, payments y propuestas Custom son consultables por un worker activo mediante RLS.",
              },
              {
                icon: <Upload className="h-5 w-5" />,
                title: "Documentación",
                text: "El worker puede subir el PDF Modira, asociarlo mediante RPC y validar su SHA-256 mediante la Edge Function.",
              },
              {
                icon: <ShieldCheck className="h-5 w-5" />,
                title: "Integridad",
                text: "Las facturas emitidas son históricas; no se ofrece DELETE. Los fallos de cobro y los datos fiscales emitidos quedan protegidos por las reglas de mantenimiento.",
              },
              {
                icon: <Wrench className="h-5 w-5" />,
                title: "Proyectos",
                text: "Los proyectos de un contrato se pueden asociar o desasociar mediante las RPCs worker de la migración 071, sin DML directo sobre la relación.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.04)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#102A66]/8 text-[#102A66]">
                  {item.icon}
                </div>
                <h3 className="mt-4 text-sm font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
