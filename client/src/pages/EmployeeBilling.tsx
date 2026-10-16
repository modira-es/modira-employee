import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction, type ComponentType } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  Eye,
  FileCheck2,
  FileText,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserRound,
  Info,
  X,
  AlertCircle,
  Building2,
  BriefcaseBusiness,
  Calculator,
  ShieldCheck,
  Menu,
  BarChart3,
  Bell,
  FolderKanban,
  Ticket,
  Activity,
  Zap,
} from "lucide-react";

type InvoiceStatus = "pendiente" | "pagada" | "vencida" | "cancelada";

type ServiceLine = {
  descripcion: string;
  cantidad: number;
  precio: number;
};

type InvoiceForm = {
  company_id: string;
  project_id: string;
  user_id: string;
  numero_factura: string;
  titulo: string;
  descripcion_detallada: string;
  servicios_incluidos: ServiceLine[];
  precio_base: string;
  iva_aplicado: boolean;
  iva_porcentaje: string;
  irpf_aplicado: boolean;
  irpf_porcentaje: string;
  estado: InvoiceStatus;
  fecha_emision: string;
  fecha_vencimiento: string;
  notas: string;
};

type EmployeeBillingProps = {
  basePath?: string;
  onCreateInvoice?: () => void;
  onMenuNavigate?: (id: string) => void;
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

/*
 * "Pagada" no es un estado que el worker pueda asignar manualmente.
 * La BD lo establece cuando existe un pago confirmado (031/012) y 043
 * protege la transición mediante trigger, independientemente del frontend.
 */
const WORKER_EDITABLE_STATUSES: InvoiceStatus[] = [
  "pendiente",
  "vencida",
  "cancelada",
];

function roundCurrency(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function calculateFiscalAmounts(
  subtotalValue: number,
  ivaApplied: boolean,
  ivaPercentage: number,
  irpfApplied: boolean,
  irpfPercentage: number,
) {
  const subtotal = roundCurrency(Math.max(Number(subtotalValue) || 0, 0));
  const ivaRate = ivaApplied
    ? roundCurrency(Math.max(Number(ivaPercentage) || 0, 0))
    : 0;

  // Misma secuencia que public.sync_invoice_amounts():
  // subtotal -> IVA redondeado -> monto redondeado -> IRPF sobre subtotal
  // -> importe_a_pagar redondeado.
  const ivaImporte = ivaApplied
    ? roundCurrency((subtotal * ivaRate) / 100)
    : 0;

  const monto = roundCurrency(subtotal + ivaImporte);

  const irpfRate = irpfApplied
    ? roundCurrency(Math.max(Number(irpfPercentage) || 0, 0))
    : 0;

  // IMPORTANTE: el backend calcula el IRPF sobre subtotal, NO sobre monto.
  const irpfImporte = irpfApplied
    ? roundCurrency((subtotal * irpfRate) / 100)
    : 0;

  const importeAPagar = roundCurrency(
    Math.max(monto - irpfImporte, 0),
  );

  return {
    subtotal,
    ivaRate,
    ivaImporte,
    monto,
    irpfRate,
    irpfImporte,
    importeAPagar,
  };
}

const emptyForm = (): InvoiceForm => ({
  company_id: "",
  project_id: "",
  user_id: "",
  numero_factura: "",
  titulo: "",
  descripcion_detallada: "",
  servicios_incluidos: [{ descripcion: "", cantidad: 1, precio: 0 }],
  precio_base: "",
  iva_aplicado: true,
  iva_porcentaje: "21",
  irpf_aplicado: false,
  irpf_porcentaje: "0",
  estado: "pendiente",
  fecha_emision: getTodayForInput(),
  fecha_vencimiento: "",
  notas: "",
});

function getTodayForInput() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: unknown, currency = "EUR") {
  const number = Number(value || 0);
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
}

function dateLabel(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function normalizedStatus(value: unknown): InvoiceStatus {
  const status = String(value || "").toLowerCase() as InvoiceStatus;
  return ["pendiente", "pagada", "vencida", "cancelada"].includes(status)
    ? status
    : "pendiente";
}

function statusBadge(status: unknown) {
  const normalized = normalizedStatus(status);
  const styles: Record<InvoiceStatus, string> = {
    pendiente: "border-none bg-amber-100 text-amber-700 hover:bg-amber-100",
    pagada: "border-none bg-green-100 text-green-700 hover:bg-green-100",
    vencida: "border-none bg-red-100 text-red-700 hover:bg-red-100",
    cancelada: "border-none bg-gray-100 text-gray-600 hover:bg-gray-100",
  };

  return (
    <Badge className={styles[normalized]}>
      {STATUS_LABELS[normalized]}
    </Badge>
  );
}

function calculateSubtotal(lines: ServiceLine[]) {
  return lines.reduce(
    (total, line) =>
      total + Number(line.cantidad || 0) * Number(line.precio || 0),
    0,
  );
}

function parseInvoiceDescription(description: string | null | undefined) {
  const text = String(description || "").trim();
  if (!text) {
    return {
      title: "",
      descriptionDetail: "",
      notes: "",
      services: [{ descripcion: "", cantidad: 1, precio: 0 }] as ServiceLine[],
    };
  }

  const lines = text.split("\n");

  const titleLine = lines.find((line) =>
    line.toLowerCase().startsWith("título:"),
  );
  const descriptionLine = lines.find((line) =>
    line.toLowerCase().startsWith("descripción detallada:"),
  );
  const notesLine = lines.find((line) =>
    line.toLowerCase().startsWith("notas:"),
  );

  /*
   * buildInvoiceDescription() serializa los precios con punto decimal
   * (ej. "1250.50"). No debemos eliminar todos los puntos porque eso
   * convierte 1250.50 en 125050.
   *
   * También aceptamos formatos antiguos/localizados con coma decimal.
   */
  const toNumber = (value: string) => {
    const raw = String(value || "").trim().replace(/\s/g, "");
    if (!raw) return 0;

    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");

    let normalized = raw;

    if (lastComma !== -1 && lastDot !== -1) {
      // El último separador se considera decimal.
      if (lastComma > lastDot) {
        normalized = raw.replace(/\./g, "").replace(",", ".");
      } else {
        normalized = raw.replace(/,/g, "");
      }
    } else if (lastComma !== -1) {
      normalized = raw.replace(",", ".");
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const services = lines.flatMap((line) => {
    const match = line.match(
      /^-\s*(.*?)\s*\|\s*Cantidad:\s*([0-9.,]+)\s*\|\s*Precio:\s*([0-9.,]+)\s*€/i,
    );

    if (!match) return [];

    return [
      {
        descripcion: match[1].trim(),
        cantidad: toNumber(match[2]) || 0,
        precio: toNumber(match[3]) || 0,
      },
    ];
  });

  return {
    title: titleLine
      ? titleLine.slice("Título:".length).trim()
      : lines[0] || "",
    descriptionDetail: descriptionLine
      ? descriptionLine
          .slice("Descripción detallada:".length)
          .trim()
      : "",
    notes: notesLine ? notesLine.slice("Notas:".length).trim() : "",
    services:
      services.length > 0
        ? services
        : ([{ descripcion: "", cantidad: 1, precio: 0 }] as ServiceLine[]),
  };
}

function buildInvoiceDescription(form: InvoiceForm) {
  const servicesText = form.servicios_incluidos
    .filter(
      (service) =>
        String(service.descripcion || "").trim() ||
        Number(service.cantidad || 0) !== 0 ||
        Number(service.precio || 0) !== 0,
    )
    .map(
      (service) =>
        `- ${String(service.descripcion || "Servicio").trim() || "Servicio"} | Cantidad: ${Number(service.cantidad || 0)} | Precio: ${Number(service.precio || 0).toFixed(2)} €`,
    )
    .join("\n");

  return [
    form.titulo.trim() ? `Título: ${form.titulo.trim()}` : null,
    form.descripcion_detallada.trim()
      ? `Descripción detallada: ${form.descripcion_detallada.trim()}`
      : null,
    servicesText ? `Servicios incluidos:\n${servicesText}` : null,
    form.notas.trim() ? `Notas: ${form.notas.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function toForm(invoice: any): InvoiceForm {
  const parsed = parseInvoiceDescription(invoice?.descripcion);

  return {
    company_id: invoice?.company_id || "",
    project_id: invoice?.project_id || "",
    user_id: invoice?.user_id || "",
    numero_factura: invoice?.numero_factura || "",
    titulo: parsed.title,
    descripcion_detallada: parsed.descriptionDetail,
    servicios_incluidos: parsed.services,
    precio_base: String(
      invoice?.subtotal ??
        Math.max(
          Number(invoice?.monto || 0) - Number(invoice?.iva_importe || 0),
          0,
        ),
    ),
    iva_aplicado: invoice?.iva_aplicado !== false,
    iva_porcentaje: String(invoice?.iva_porcentaje ?? 0),
    irpf_aplicado: Boolean(invoice?.irpf_aplicado),
    irpf_porcentaje: String(invoice?.irpf_porcentaje ?? 0),
    estado: normalizedStatus(invoice?.estado),
    fecha_emision: invoice?.fecha_emision
      ? new Date(invoice.fecha_emision).toISOString().slice(0, 10)
      : getTodayForInput(),
    fecha_vencimiento: invoice?.fecha_vencimiento
      ? new Date(invoice.fecha_vencimiento).toISOString().slice(0, 10)
      : "",
    notas: parsed.notes,
  };
}

function validateForm(form: InvoiceForm) {
  if (!form.company_id) return "Selecciona una empresa.";
  if (!form.project_id) return "Selecciona un proyecto.";
  if (!form.titulo.trim()) return "Introduce un título para la factura.";

  const subtotal = Number(form.precio_base || 0);
  const iva = Number(form.iva_porcentaje || 0);
  const irpf = Number(form.irpf_porcentaje || 0);

  if (!Number.isFinite(subtotal) || subtotal < 0) {
    return "La base imponible no es válida.";
  }

  if (
    form.iva_aplicado &&
    (!Number.isFinite(iva) || iva < 0 || iva > 100)
  ) {
    return "El porcentaje de IVA debe estar entre 0 y 100.";
  }

  if (!form.iva_aplicado && Number(form.iva_porcentaje || 0) !== 0) {
    return "Si el IVA no se aplica, el porcentaje debe ser 0.";
  }

  if (
    form.irpf_aplicado &&
    (!Number.isFinite(irpf) || irpf <= 0 || irpf > 100)
  ) {
    return "El porcentaje de IRPF debe ser mayor que 0 y menor o igual que 100.";
  }

  if (
    form.fecha_emision &&
    form.fecha_vencimiento &&
    form.fecha_vencimiento < form.fecha_emision
  ) {
    return "La fecha de vencimiento no puede ser anterior a la fecha de emisión.";
  }

  return null;
}

const MAX_INVOICE_PDF_SIZE = 10 * 1024 * 1024;

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

async function uploadInvoicePdf(invoice: any, file: File) {
  if (!file) return;
  if (!invoice?.id) throw new Error("La factura no es válida.");
  if (!invoice?.numero_factura) {
    throw new Error("La factura no tiene un número válido para su documento.");
  }

  if (!isPdfFile(file)) throw new Error("Solo se permiten archivos PDF.");
  if (file.size <= 0) {
    throw new Error("El PDF seleccionado está vacío.");
  }
  if (file.size > MAX_INVOICE_PDF_SIZE) {
    throw new Error("El PDF no puede superar los 10 MB.");
  }

  // La ruta nunca procede del nombre elegido por el usuario.
  // Se deriva exclusivamente del número generado por el backend.
  const path = `${invoice.numero_factura}.pdf`;
  const hadExistingDocument = Boolean(
    String(invoice.document_path || "").trim(),
  );

  const { error: uploadError } = await supabase.storage
    .from("invoices")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: "application/pdf",
    });

  if (uploadError) throw uploadError;

  const { error: attachError } = await supabase.rpc(
    "attach_invoice_document",
    {
      p_invoice_id: invoice.id,
      p_document_path: path,
    },
  );

if (attachError) {
  // Si era una factura sin documento previo, podemos limpiar el objeto
  // recién creado sin arriesgar un PDF existente. En una sustitución
  // conservamos el objeto porque upsert ya ha reemplazado la misma ruta.
  if (!hadExistingDocument) {
    const { error: cleanupError } = await supabase.storage
      .from("invoices")
      .remove([path]);

    if (cleanupError) {
      console.warn(
        "[EmployeeBilling] No se pudo limpiar el PDF tras fallar el attach:",
        cleanupError,
      );
    }
  }

  throw attachError;
}

// ============================================================
// VALIDAR DOCUMENTO Y GENERAR SHA-256
// ============================================================
//
// attach_invoice_document() deja document_sha256 = NULL
// intencionadamente. A continuación se valida el PDF real
// almacenado en Storage mediante la Edge Function protegida.
// ============================================================

const {
  data: hashData,
  error: hashError,
} = await supabase.functions.invoke(
  "set-invoice-document-hash",
  {
    body: {
      invoice_id: invoice.id,
    },
  },
);

if (hashError) {
  console.error(
    "[EmployeeBilling] Error validando SHA-256 del PDF:",
    hashError,
  );

  try {
    const errorBody = await hashError.context?.json();

    console.error(
      "[EmployeeBilling] Respuesta real de set-invoice-document-hash:",
      errorBody,
    );

    throw new Error(
      errorBody?.error ||
        hashError.message ||
        "El PDF se ha adjuntado, pero no se ha podido validar su huella digital.",
    );
  } catch (responseError) {
    console.error(
      "[EmployeeBilling] No se pudo leer la respuesta de la Edge Function:",
      responseError,
    );

    throw new Error(
      hashError.message ||
        "El PDF se ha adjuntado, pero no se ha podido validar su huella digital.",
    );
  }
}

if (
  !hashData?.success ||
  !hashData?.document_sha256 ||
  !/^[0-9a-f]{64}$/i.test(
    String(hashData.document_sha256),
  )
) {
  throw new Error(
    "El PDF se ha adjuntado, pero no se ha podido validar correctamente su huella digital.",
  );
}

return path;
}

function getProjectName(projects: any[], id: string | null | undefined) {
  return (
    projects.find((project) => String(project.id) === String(id))?.nombre ||
    "Sin proyecto"
  );
}

function getCompanyName(companies: any[], id: string | null | undefined) {
  return (
    companies.find((company) => String(company.id) === String(id))
      ?.company_name || "Sin empresa"
  );
}


export default function EmployeeBilling({
  basePath = "/employee/billing",
  onCreateInvoice,
  onMenuNavigate,
}: EmployeeBillingProps) {
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const detailId = getDetailId(basePath);
  const isCreate = getNewRoute(basePath);
  const employeeRoot = basePath.replace(/\/billing\/?$/, "") || "/employee";

  const navigateFromMenu = (id: string) => {
    setMenuOpen(false);
    if (onMenuNavigate) {
      onMenuNavigate(id);
      return;
    }
    const pathMap: Record<string, string> = {
      dashboard: employeeRoot,
      projects: `${employeeRoot}/projects`,
      companies: `${employeeRoot}/companies`,
      quotations: `${employeeRoot}/quotations`,
      billing: basePath,
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
    const target = pathMap[id];
    if (target) setLocation(target);
  };

  const navigation = (
    <EmployeeBillingNavigation
      open={menuOpen}
      location={location}
      employeeRoot={employeeRoot}
      billingBase={basePath}
      onClose={() => setMenuOpen(false)}
      onNavigate={navigateFromMenu}
    />
  );

  const overlay = menuOpen ? (
    <div
      className="fixed inset-0 z-40 bg-[#172033]/20 backdrop-blur-[1px]"
      onClick={() => setMenuOpen(false)}
      aria-hidden="true"
    />
  ) : null;

  if (isCreate) {
    return (
      <>
        {navigation}
        {overlay}
        <QuotationCompatibleCreate
          basePath={basePath}
          onOpenMenu={() => setMenuOpen(true)}
        />
      </>
    );
  }

  if (detailId) {
    return (
      <>
        {navigation}
        {overlay}
        <InvoiceDetail
          invoiceId={detailId}
          basePath={basePath}
          onOpenMenu={() => setMenuOpen(true)}
        />
      </>
    );
  }

  return (
    <>
      {navigation}
      {overlay}
      <InvoiceList
        basePath={basePath}
        onOpenMenu={() => setMenuOpen(true)}
        onCreate={() => {
          if (onCreateInvoice) onCreateInvoice();
          else setLocation(`${basePath}/new`);
        }}
      />
    </>
  );
}

function getDetailId(basePath: string) {
  if (typeof window === "undefined") return null;

  const current = window.location.pathname.replace(/\/+$/, "");
  const base = basePath.replace(/\/+$/, "");

  if (!current.startsWith(`${base}/`)) return null;

  const rest = current.slice(`${base}/`.length);
  if (!rest || rest === "new") return null;

  const first = rest.split("/")[0];
  return first || null;
}

function getNewRoute(basePath: string) {
  if (typeof window === "undefined") return false;

  const current = window.location.pathname.replace(/\/+$/, "");
  const base = basePath.replace(/\/+$/, "");

  return current === `${base}/new`;
}

function InvoiceList({
  basePath,
  onCreate,
  onOpenMenu,
}: {
  basePath: string;
  onCreate: () => void;
  onOpenMenu: () => void;
}) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>(
    "all",
  );
  const [sort, setSort] = useState("recent");
  const [, setLocation] = useLocation();

  const loadData = async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);

      const [
        { data: invoiceData, error: invoiceError },
        { data: companyData, error: companyError },
        { data: projectData, error: projectError },
      ] = await Promise.all([
        supabase
          .from("invoices")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
  .from("companies")
  .select(
    "id, company_name, currency, iva_recomendado_aplicado, iva_recomendado_porcentaje"
  )
  .order("company_name", { ascending: true }),
        supabase
          .from("projects")
          .select("id, nombre, company_id, client_id, user_id, estado")
          .order("nombre", { ascending: true }),
      ]);

      if (invoiceError) throw invoiceError;
      if (companyError) throw companyError;
      if (projectError) throw projectError;

      setInvoices(invoiceData || []);
      setCompanies(companyData || []);
      setProjects(projectData || []);
    } catch (error) {
      console.error("[EmployeeBilling] Error loading billing:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const visibleProjects = useMemo(
    () =>
      companyFilter === "all"
        ? projects.filter((project) =>
            invoices.some((invoice) => invoice.project_id === project.id),
          )
        : projects.filter(
            (project) =>
              String(project.company_id) === String(companyFilter),
          ),
    [projects, invoices, companyFilter],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...invoices]
      .filter((invoice) => {
        const companyMatch =
          companyFilter === "all" ||
          String(invoice.company_id) === String(companyFilter);

        const projectMatch =
          projectFilter === "all" ||
          String(invoice.project_id) === String(projectFilter);

        const statusMatch =
          statusFilter === "all" ||
          normalizedStatus(invoice.estado) === statusFilter;

        if (!companyMatch || !projectMatch || !statusMatch) return false;
        if (!query) return true;

        const title = parseInvoiceDescription(invoice.descripcion).title;
        const company = getCompanyName(companies, invoice.company_id);
        const project = getProjectName(projects, invoice.project_id);

        return [invoice.numero_factura, title, company, project]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(query),
          );
      })
      .sort((a, b) => {
        if (sort === "amount-high") {
          return Number(b.importe_a_pagar || b.monto || 0) -
            Number(a.importe_a_pagar || a.monto || 0);
        }

        if (sort === "amount-low") {
          return Number(a.importe_a_pagar || a.monto || 0) -
            Number(b.importe_a_pagar || b.monto || 0);
        }

        if (sort === "due-soon") {
          return (
            new Date(a.fecha_vencimiento || "9999-12-31").getTime() -
            new Date(b.fecha_vencimiento || "9999-12-31").getTime()
          );
        }

        const dateA = new Date(
          a.created_at || a.fecha_emision || 0,
        ).getTime();
        const dateB = new Date(
          b.created_at || b.fecha_emision || 0,
        ).getTime();

        return sort === "oldest" ? dateA - dateB : dateB - dateA;
      });
  }, [
    invoices,
    companies,
    projects,
    search,
    companyFilter,
    projectFilter,
    statusFilter,
    sort,
  ]);

  const metrics = useMemo(() => {
  const total = filtered.length;

  const pending = filtered.filter(
    (invoice) => normalizedStatus(invoice.estado) === "pendiente",
  ).length;

  const overdue = filtered.filter(
    (invoice) => normalizedStatus(invoice.estado) === "vencida",
  ).length;

  const paid = filtered.filter(
    (invoice) => normalizedStatus(invoice.estado) === "pagada",
  ).length;

  const totalBilled = filtered.reduce(
    (sum, invoice) => sum + Number(invoice.monto || 0),
    0,
  );

  const totalReceivable = filtered
    .filter((invoice) => {
      const status = normalizedStatus(invoice.estado);

      return status !== "pagada" && status !== "cancelada";
    })
    .reduce(
      (sum, invoice) => sum + Number(invoice.importe_a_pagar || 0),
      0,
    );

  return {
    total,
    pending,
    overdue,
    paid,
    totalBilled,
    totalReceivable,
  };
}, [filtered]);

  if (loading) {
    return (
      <PageShell title="Facturación" subtitle="Cargando facturación..." onOpenMenu={onOpenMenu}>
        <PageLoading text="Cargando facturación..." />
      </PageShell>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-5 sm:p-6 lg:p-8">
        <TopPageHeader eyebrow="Facturación" subtitle="Gestión de facturas y cobros" onOpenMenu={onOpenMenu} />

      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
            <ReceiptText className="h-4 w-4" />
            Gestión financiera
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E3A8A]">
            Facturación
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Gestiona facturas, fiscalidad, vencimientos y documentación desde
            un único espacio.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => loadData(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Actualizar
          </button>

          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white shadow-none transition hover:bg-[#162D6B]"
          >
            <Plus className="h-4 w-4" />
            Crear factura
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <MetricCard
          icon={<FileText className="h-4 w-4" />}
          label="Facturas"
          value={metrics.total}
        />
        <MetricCard
          icon={<Clock3 className="h-4 w-4" />}
          label="Pendientes"
          value={metrics.pending}
        />
        <MetricCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="Vencidas"
          value={metrics.overdue}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Pagadas"
          value={metrics.paid}
        />
        <MetricCard
          icon={<Calculator className="h-4 w-4" />}
          label="Facturado"
          value={money(metrics.totalBilled)}
        />
        <MetricCard
          icon={<CircleDollarSign className="h-4 w-4" />}
          label="Por cobrar"
          value={money(metrics.totalReceivable)}
        />
      </div>

      <div className="border-gray-200 bg-white shadow-none">
        <div className="flex flex-col gap-3 p-4 xl:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por número, empresa, proyecto o título..."
              className="h-10 border-gray-200 pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterSelect
              value={companyFilter}
              onChange={(value) => {
                setCompanyFilter(value);
                setProjectFilter("all");
              }}
              options={[
                { value: "all", label: "Todas las empresas" },
                ...companies.map((company) => ({
                  value: company.id,
                  label: company.company_name,
                })),
              ]}
            />

            <FilterSelect
              value={projectFilter}
              onChange={setProjectFilter}
              options={[
                { value: "all", label: "Todos los proyectos" },
                ...visibleProjects.map((project) => ({
                  value: project.id,
                  label: project.nombre,
                })),
              ]}
            />

            <FilterSelect
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as "all" | InvoiceStatus)
              }
              options={[
                { value: "all", label: "Todos los estados" },
                ...Object.entries(STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />

            <FilterSelect
              value={sort}
              onChange={setSort}
              options={[
                { value: "recent", label: "Más recientes" },
                { value: "oldest", label: "Más antiguas" },
                { value: "amount-high", label: "Mayor importe" },
                { value: "amount-low", label: "Menor importe" },
                { value: "due-soon", label: "Próximo vencimiento" },
              ]}
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyInvoices hasFilters={Boolean(search || companyFilter !== "all" || projectFilter !== "all" || statusFilter !== "all")} onCreate={onCreate} />
      ) : (
        <>
          <div className="hidden overflow-hidden border-gray-200 bg-white shadow-none md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3">Factura</th>
                    <th className="px-5 py-3">Cliente / proyecto</th>
                    <th className="px-5 py-3">Emisión</th>
                    <th className="px-5 py-3">Vencimiento</th>
                    <th className="px-5 py-3">Importe</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3 text-right"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {filtered.map((invoice) => {
                    const parsed = parseInvoiceDescription(invoice.descripcion);
                    const amount = Number(
                      invoice.importe_a_pagar ?? invoice.monto ?? 0,
                    );

                    return (
                      <tr
                        key={invoice.id}
                        onClick={() =>
                          setLocation(`${basePath}/${invoice.id}`)
                        }
                        className="cursor-pointer transition hover:bg-gray-50/80"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1E3A8A]">
                              <ReceiptText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900">
                                {invoice.numero_factura || "Sin número"}
                              </p>
                              <p className="mt-0.5 max-w-[240px] truncate text-xs text-gray-500">
                                {parsed.title || "Sin título"}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-800">
                            {getCompanyName(companies, invoice.company_id)}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {getProjectName(projects, invoice.project_id)}
                          </p>
                        </td>

                        <td className="px-5 py-4 text-gray-600">
                          {dateLabel(invoice.fecha_emision)}
                        </td>

                        <td className="px-5 py-4 text-gray-600">
                          {dateLabel(invoice.fecha_vencimiento)}
                        </td>

                        <td className="px-5 py-4 font-semibold text-gray-900">
                          {money(amount, getCompanyCurrency(companies, invoice.company_id))}
                        </td>

                        <td className="px-5 py-4">
                          {statusBadge(invoice.estado)}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <ChevronRight className="ml-auto h-4 w-4 text-gray-400" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((invoice) => {
              const parsed = parseInvoiceDescription(invoice.descripcion);
              const amount = Number(
                invoice.importe_a_pagar ?? invoice.monto ?? 0,
              );

              return (
                <button
                  type="button"
                  key={invoice.id}
                  onClick={() => setLocation(`${basePath}/${invoice.id}`)}
                  className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-none transition hover:border-gray-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1E3A8A]">
                        <ReceiptText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">
                          {invoice.numero_factura || "Sin número"}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {parsed.title || "Sin título"}
                        </p>
                      </div>
                    </div>
                    {statusBadge(invoice.estado)}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs">
                    <InfoMini
                      label="Empresa"
                      value={getCompanyName(companies, invoice.company_id)}
                    />
                    <InfoMini
                      label="Proyecto"
                      value={getProjectName(projects, invoice.project_id)}
                    />
                    <InfoMini
                      label="Vencimiento"
                      value={dateLabel(invoice.fecha_vencimiento)}
                    />
                    <InfoMini
                      label="A pagar"
                      value={money(
                        amount,
                        getCompanyCurrency(companies, invoice.company_id),
                      )}
                      strong
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Mostrando {filtered.length} de {invoices.length} facturas
        </span>
        <span className="hidden sm:inline">
          La numeración de factura la genera el backend.
        </span>
      </div>
        </div>
      </div>
  );
}

function getCompanyCurrency(companies: any[], companyId: string) {
  return companies.find((company) => String(company.id) === String(companyId))
    ?.currency || "EUR";
}

function InvoiceDetail({
  invoiceId,
  basePath,
  onOpenMenu,
}: {
  invoiceId: string;
  basePath: string;
  onOpenMenu: () => void;
}) {
  const [invoice, setInvoice] = useState<any | null>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [openingPdf, setOpeningPdf] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<InvoiceForm | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [, setLocation] = useLocation();

  const load = async () => {
    try {
      setLoading(true);

      const [
        { data: invoiceData, error: invoiceError },
        { data: companyData, error: companyError },
        { data: projectData, error: projectError },
        { data: profileData, error: profileError },
      ] = await Promise.all([
        supabase
          .from("invoices")
          .select("*")
          .eq("id", invoiceId)
          .single(),
        supabase
.from("companies")
.select(
  "id, company_name, currency, iva_recomendado_aplicado, iva_recomendado_porcentaje, iva_aprobado_aplicado, iva_aprobado_porcentaje, iva_aprobado_at"
)
.order("company_name", { ascending: true }),
        supabase
          .from("projects")
          .select("id, nombre, company_id, client_id, user_id, estado")
          .order("nombre", { ascending: true }),
        supabase
          .from("profiles")
          .select("id, nombre, email, telefono, company_id, rol")
          .order("nombre", { ascending: true }),
      ]);

      if (invoiceError) throw invoiceError;
      if (companyError) throw companyError;
      if (projectError) throw projectError;
      if (profileError) throw profileError;

      setInvoice(invoiceData);
      setCompanies(companyData || []);
      setProjects(projectData || []);
      setProfiles(profileData || []);
      setForm(toForm(invoiceData));
    } catch (loadError: any) {
      console.error("[EmployeeBilling] Error loading invoice:", loadError);
      setError(loadError?.message || "No se pudo cargar la factura.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [invoiceId]);


  const client = invoice
    ? profiles.find((profile) => String(profile.id) === String(invoice.user_id))
    : null;

  const parsed = parseInvoiceDescription(invoice?.descripcion);
  const currency = getCompanyCurrency(companies, invoice?.company_id);
  const subtotal = Number(invoice?.subtotal || 0);
  const ivaImporte = Number(invoice?.iva_importe || 0);
  const monto = Number(invoice?.monto || subtotal + ivaImporte);
  const irpfImporte = Number(invoice?.irpf_importe || 0);
  const payable = Number(invoice?.importe_a_pagar ?? monto - irpfImporte);

  const openPdf = async (download = false) => {
    if (!invoice?.document_path) {
      setError("Esta factura todavía no tiene un PDF adjunto.");
      return;
    }

    try {
      setOpeningPdf(true);
      setError("");

      const { data, error: signedUrlError } = await supabase.storage
        .from("invoices")
        .createSignedUrl(invoice.document_path, 300, {
          ...(download
            ? { download: `${invoice.numero_factura}.pdf` }
            : {}),
        });

      if (signedUrlError) throw signedUrlError;
      if (!data?.signedUrl) {
        throw new Error("No se pudo generar el enlace seguro del PDF.");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (openError: any) {
      console.error("[EmployeeBilling] Error opening invoice PDF:", openError);
      setError(openError?.message || "No se pudo abrir el PDF.");
    } finally {
      setOpeningPdf(false);
    }
  };

  const save = async () => {
    if (!invoice || !form) return;

    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    // 043: "pagada" no puede asignarse manualmente desde el worker;
    // esta comprobación es solo una defensa temprana de UX. La garantía real
    // está en protect_invoice_paid_status() dentro de PostgreSQL.
    if (
      normalizedStatus(invoice.estado) !== "pagada" &&
      form.estado === "pagada"
    ) {
      setError(
        "Una factura solo puede pasar a Pagada cuando existe un pago confirmado.",
      );
      return;
    }

    const project = projects.find(
      (item) => String(item.id) === String(form.project_id),
    );

    if (!project) {
      setError("El proyecto seleccionado no existe.");
      return;
    }

    if (String(project.company_id) !== String(form.company_id)) {
      setError("El proyecto no pertenece a la empresa seleccionada.");
      return;
    }

    if (!project.user_id) {
      setError("El proyecto seleccionado no tiene un usuario asociado.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const { data, error: rpcError } = await supabase.rpc(
        "update_invoice_by_worker",
        {
          p_invoice_id: invoice.id,
          p_company_id: form.company_id,
          p_project_id: form.project_id,
          p_fecha_emision: form.fecha_emision
            ? new Date(`${form.fecha_emision}T00:00:00`).toISOString()
            : null,
          p_fecha_vencimiento: form.fecha_vencimiento
            ? new Date(`${form.fecha_vencimiento}T00:00:00`).toISOString()
            : null,
          p_descripcion: buildInvoiceDescription(form) || null,
          p_subtotal: roundCurrency(Number(form.precio_base || 0)),
          p_iva_aplicado: Boolean(form.iva_aplicado),
          p_iva_porcentaje: form.iva_aplicado
            ? Number(form.iva_porcentaje || 0)
            : 0,
          p_irpf_aplicado: Boolean(form.irpf_aplicado),
          p_irpf_porcentaje: form.irpf_aplicado
            ? Number(form.irpf_porcentaje || 0)
            : 0,
          p_estado: form.estado,
        },
      );

      if (rpcError) throw rpcError;

      const saved = Array.isArray(data) ? data[0] : data;
      if (!saved?.id) throw new Error("La factura no se pudo actualizar.");

      if (pdfFile) {
        await uploadInvoicePdf(saved, pdfFile);
      }

      setInvoice(saved);
      setForm(toForm(saved));
      setPdfFile(null);
      setEditing(false);

      await load();
    } catch (saveError: any) {
      console.error("[EmployeeBilling] Error saving invoice:", saveError);
      setError(saveError?.message || "No se pudo actualizar la factura.");
    } finally {
      setSaving(false);
    }
  };

  const deleteInvoice = async () => {
    if (!invoice) return;

    if (
      !window.confirm(
        `¿Seguro que quieres eliminar la factura ${invoice.numero_factura}? Esta acción también eliminará su PDF asociado.`,
      )
    ) {
      return;
    }

    try {
      setDeleting(true);
      setError("");

      const { data, error: rpcError } = await supabase.rpc(
        "delete_invoice_by_worker",
        { p_invoice_id: invoice.id },
      );

      if (rpcError) throw rpcError;
      if (!data) throw new Error("La factura no se pudo eliminar correctamente.");

      setLocation(basePath);
    } catch (deleteError: any) {
      console.error("[EmployeeBilling] Error deleting invoice:", deleteError);
      setError(deleteError?.message || "No se pudo eliminar la factura.");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Facturación" subtitle="Cargando factura..." onOpenMenu={onOpenMenu}>
        <PageLoading text="Cargando factura..." />
      </PageShell>
    );
  }
  if (!invoice) {
    return (
      <PageShell title="Facturación" subtitle="Ficha de factura" onOpenMenu={onOpenMenu}>
        <ErrorState
          message={error || "Factura no encontrada."}
          onBack={() => setLocation(basePath)}
        />
      </PageShell>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <TopPageHeader eyebrow="Facturación" subtitle="Ficha de factura" onOpenMenu={onOpenMenu} />

    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setLocation(basePath)}
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a facturación
        </button>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {statusBadge(invoice.estado)}
              {invoice.document_path ? (
                <Badge
                  variant="outline"
                  className="border-green-200 bg-green-50 text-green-700"
                >
                  <FileCheck2 className="mr-1 h-3.5 w-3.5" />
                  PDF adjunto
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-gray-200 bg-white text-gray-500"
                >
                  Sin PDF
                </Badge>
              )}
            </div>

            <p className="text-sm font-semibold text-[#1E3A8A]">
              {invoice.numero_factura}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">
              {parsed.title || "Factura"}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              {getCompanyName(companies, invoice.company_id)} ·{" "}
              {getProjectName(projects, invoice.project_id)}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {invoice.document_path && (
              <>
                <button
                  type="button"
                  onClick={() => openPdf(false)}
                  disabled={openingPdf}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                >
                  {openingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  Ver PDF
                </button>

                <button
                  type="button"
                  onClick={() => openPdf(true)}
                  disabled={openingPdf}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  Descargar
                </button>
              </>
            )}

            {!editing && (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setPdfFile(null);
                  setEditing(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#162D6B]"
              >
                <Pencil className="h-4 w-4" />
                Editar
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {editing && form ? (
        <InvoiceEditor
          form={form}
          setForm={(next) => {
            setForm((current) => {
              if (!current) return current;
              return typeof next === "function" ? next(current) : next;
            });
          }}
          companies={companies}
          projects={projects}
          pdfFile={pdfFile}
          setPdfFile={setPdfFile}
          saving={saving}
          onCancel={() => {
            setForm(toForm(invoice));
            setPdfFile(null);
            setEditing(false);
            setError("");
          }}
          onSave={save}
          creationMode={false}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard
              icon={<Calculator className="h-4 w-4" />}
              label="Base imponible"
              value={money(subtotal, currency)}
            />
            <MetricCard
              icon={<CircleDollarSign className="h-4 w-4" />}
              label="IVA"
              value={invoice.iva_aplicado ? money(ivaImporte, currency) : "No aplicado"}
              helper={
                invoice.iva_aplicado
                  ? `${Number(invoice.iva_porcentaje || 0).toFixed(2)}%`
                  : undefined
              }
            />
            <MetricCard
              icon={<ReceiptText className="h-4 w-4" />}
              label="Total bruto"
              value={money(monto, currency)}
            />
            <MetricCard
              icon={<ShieldCheck className="h-4 w-4" />}
              label="IRPF"
              value={
                invoice.irpf_aplicado
                  ? money(irpfImporte, currency)
                  : "No aplicado"
              }
              helper={
                invoice.irpf_aplicado
                  ? `${Number(invoice.irpf_porcentaje || 0).toFixed(2)}%`
                  : undefined
              }
            />
            <MetricCard
              icon={<CreditCard className="h-4 w-4" />}
              label="A pagar"
              value={money(payable, currency)}
              emphasized
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-6">
              <Section title="Información de la factura" icon={<FileText className="h-4 w-4" />}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <InfoBlock
                    icon={<Building2 className="h-4 w-4" />}
                    label="Empresa"
                    value={getCompanyName(companies, invoice.company_id)}
                  />
                  <InfoBlock
                    icon={<BriefcaseBusiness className="h-4 w-4" />}
                    label="Proyecto"
                    value={getProjectName(projects, invoice.project_id)}
                  />
                  <InfoBlock
                    icon={<UserRound className="h-4 w-4" />}
                    label="Cliente / usuario del proyecto"
                    value={client?.nombre || client?.email || "Sin cliente"}
                    secondary={client?.email}
                  />
                  <InfoBlock
                    icon={<CalendarDays className="h-4 w-4" />}
                    label="Fecha de emisión"
                    value={dateLabel(invoice.fecha_emision)}
                  />
                  <InfoBlock
                    icon={<CalendarDays className="h-4 w-4" />}
                    label="Fecha de vencimiento"
                    value={dateLabel(invoice.fecha_vencimiento)}
                  />
                  <InfoBlock
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    label="Fecha de pago"
                    value={dateLabel(invoice.fecha_pago)}
                  />
                </div>
              </Section>

              <Section title="Concepto y servicios" icon={<ReceiptText className="h-4 w-4" />}>
                {parsed.descriptionDetail && (
                  <div className="mb-5 rounded-lg bg-gray-50 p-4">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Descripción
                    </p>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {parsed.descriptionDetail}
                    </p>
                  </div>
                )}

                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <div className="grid grid-cols-[minmax(0,1fr)_90px_120px_130px] bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <span>Concepto</span>
                    <span className="text-right">Cantidad</span>
                    <span className="text-right">Precio</span>
                    <span className="text-right">Importe</span>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {parsed.services.map((service, index) => (
                      <div
                        key={`${service.descripcion}-${index}`}
                        className="grid grid-cols-[minmax(0,1fr)_90px_120px_130px] items-center px-4 py-3 text-sm"
                      >
                        <span className="min-w-0 text-gray-800">
                          {service.descripcion || "Servicio"}
                        </span>
                        <span className="text-right text-gray-600">
                          {Number(service.cantidad || 0)}
                        </span>
                        <span className="text-right text-gray-600">
                          {money(service.precio, currency)}
                        </span>
                        <span className="text-right font-semibold text-gray-900">
                          {money(
                            Number(service.cantidad || 0) *
                              Number(service.precio || 0),
                            currency,
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Section>

              {parsed.notes && (
                <Section title="Notas" icon={<FileText className="h-4 w-4" />}>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                    {parsed.notes}
                  </p>
                </Section>
              )}

              <Section title="Resumen fiscal" icon={<Calculator className="h-4 w-4" />}>
                <div className="space-y-3 text-sm">
                  <TotalRow label="Base imponible" value={money(subtotal, currency)} />
                  <TotalRow
                    label={`IVA (${Number(invoice.iva_porcentaje || 0).toFixed(2)}%)`}
                    value={money(ivaImporte, currency)}
                  />
                  <TotalRow
                    label="Total bruto"
                    value={money(monto, currency)}
                    strong
                  />
                  <TotalRow
                    label={
                      invoice.irpf_aplicado
                        ? `IRPF (${Number(invoice.irpf_porcentaje || 0).toFixed(2)}%)`
                        : "IRPF"
                    }
                    value={
                      invoice.irpf_aplicado
                        ? `− ${money(irpfImporte, currency)}`
                        : "No aplicado"
                    }
                  />
                  <div className="my-2 border-t border-gray-200" />
                  <TotalRow
                    label="Importe a pagar"
                    value={money(payable, currency)}
                    strong
                    emphasized
                  />
                </div>
              </Section>
            </div>

            <aside className="space-y-6">
              <div className="border-gray-200 bg-white shadow-none">
                <div className="border-b border-gray-100 p-4">
                  <p className="text-sm font-semibold text-gray-900">
                    Estado de cobro
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    El estado y la fecha de pago quedan vinculados al flujo de
                    facturación.
                  </p>
                </div>

                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">Estado</span>
                    {statusBadge(invoice.estado)}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">A pagar</span>
                    <span className="font-semibold text-gray-900">
                      {money(payable, currency)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-gray-500">Pago registrado</span>
                    <span className="text-sm font-medium text-gray-800">
                      {invoice.fecha_pago ? dateLabel(invoice.fecha_pago) : "Pendiente"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-gray-200 bg-white shadow-none">
                <div className="border-b border-gray-100 p-4">
                  <p className="text-sm font-semibold text-gray-900">
                    Documento fiscal
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    El PDF se guarda en el bucket privado de facturas.
                  </p>
                </div>

                <div className="p-4">
                  {invoice.document_path ? (
                    <div className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-green-700">
                        <FileCheck2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-800">
                          {invoice.numero_factura}.pdf
                        </p>
                        <p className="text-xs text-green-700">
                          Documento asociado
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
                      <Upload className="mx-auto h-5 w-5 text-gray-400" />
                      <p className="mt-2 text-sm font-medium text-gray-700">
                        Sin PDF adjunto
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Puedes adjuntarlo desde Editar.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-red-200 bg-white shadow-none">
                <div className="p-4">
                  <p className="text-sm font-semibold text-red-700">
                    Zona de eliminación
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    La eliminación utiliza la operación segura del backend y
                    también gestiona el PDF asociado.
                  </p>

                  <button
                    type="button"
                    onClick={deleteInvoice}
                    disabled={deleting}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                  >
                    {deleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Eliminar factura
                  </button>
                </div>
              </div>

              <div className="border-blue-100 bg-blue-50/60 shadow-none">
                <div className="flex gap-3 p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1E3A8A]" />
                  <div>
                    <p className="text-sm font-semibold text-[#1E3A8A]">
                      Flujo protegido
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-600">
                      Crear, editar y eliminar se ejecutan mediante las RPC
                      previstas para workers. El número de factura permanece
                      inmutable.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
      </div>
    </div>
  );
}

function QuotationCompatibleCreate({
  basePath,
  onOpenMenu,
}: {
  basePath: string;
  onOpenMenu: () => void;
}) {
  const [, setLocation] = useLocation();
  const [companies, setCompanies] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [form, setForm] = useState<InvoiceForm>(emptyForm());
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [
          { data: companyData, error: companyError },
          { data: projectData, error: projectError },
        ] = await Promise.all([
         supabase
  .from("companies")
  .select(
    "id, company_name, currency, iva_recomendado_aplicado, iva_recomendado_porcentaje, iva_aprobado_aplicado, iva_aprobado_porcentaje, iva_aprobado_at"
  )
  .order("company_name", { ascending: true }),
          supabase
            .from("projects")
            .select("id, nombre, company_id, client_id, user_id, estado")
            .order("nombre", { ascending: true }),
        ]);

        if (companyError) throw companyError;
        if (projectError) throw projectError;

        setCompanies(companyData || []);
        setProjects(projectData || []);
      } catch (loadError: any) {
        setError(loadError?.message || "No se pudieron cargar los datos.");
      }
    };

    load();
  }, []);

  const companyProjects = useMemo(
    () =>
      form.company_id
        ? projects.filter(
            (project) =>
              String(project.company_id) === String(form.company_id),
          )
        : [],
    [projects, form.company_id],
  );

  const save = async () => {
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (form.estado === "pagada") {
      setError(
        "Una factura nueva debe crearse como Pendiente. Solo un pago confirmado puede marcarla como Pagada.",
      );
      return;
    }

    const project = projects.find(
      (item) => String(item.id) === String(form.project_id),
    );

    if (!project) {
      setError("El proyecto seleccionado no existe.");
      return;
    }

    if (String(project.company_id) !== String(form.company_id)) {
      setError("El proyecto no pertenece a la empresa seleccionada.");
      return;
    }

    if (!project.user_id) {
      setError("El proyecto seleccionado no tiene un usuario asociado.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      /*
       * IMPORTANTE:
       * create_invoice_by_worker() no recibe numero_factura, IRPF ni estado
       * como argumentos. El backend genera el número y los valores fiscales
       * derivados mediante trigger. Por eso la creación se hace primero con
       * la RPC exacta y, si el usuario ha solicitado IRPF, se completa con
       * update_invoice_by_worker(), que sí soporta esos parámetros.
       */
      const { data, error: createError } = await supabase.rpc(
        "create_invoice_by_worker",
        {
          p_company_id: form.company_id,
          p_project_id: form.project_id,
          p_fecha_emision: form.fecha_emision
            ? new Date(`${form.fecha_emision}T00:00:00`).toISOString()
            : null,
          p_fecha_vencimiento: form.fecha_vencimiento
            ? new Date(`${form.fecha_vencimiento}T00:00:00`).toISOString()
            : null,
          p_descripcion: buildInvoiceDescription(form) || null,
          p_subtotal: roundCurrency(Number(form.precio_base || 0)),
          p_iva_porcentaje: Number(form.iva_porcentaje || 0),
        },
      );

      if (createError) throw createError;

      let saved = Array.isArray(data) ? data[0] : data;
      if (!saved?.id || !saved?.numero_factura) {
        throw new Error("El backend no devolvió una factura válida.");
      }

      /*
       * La RPC de creación mantiene IRPF=0 y el estado por defecto.
       * Si el formulario requiere IRPF o un estado explícito distinto,
       * se usa la RPC de actualización prevista por la migración.
       */
      if (
        !form.iva_aplicado ||
        Number(form.iva_porcentaje || 0) !== 21 ||
        form.irpf_aplicado ||
        Number(form.irpf_porcentaje || 0) !== 0 ||
        form.estado !== "pendiente"
      ) {
        const { data: updatedData, error: updateError } = await supabase.rpc(
          "update_invoice_by_worker",
          {
            p_invoice_id: saved.id,
            p_company_id: form.company_id,
            p_project_id: form.project_id,
            p_fecha_emision: form.fecha_emision
              ? new Date(`${form.fecha_emision}T00:00:00`).toISOString()
              : null,
            p_fecha_vencimiento: form.fecha_vencimiento
              ? new Date(`${form.fecha_vencimiento}T00:00:00`).toISOString()
              : null,
            p_descripcion: buildInvoiceDescription(form) || null,
            p_subtotal: roundCurrency(Number(form.precio_base || 0)),
            p_iva_aplicado: Boolean(form.iva_aplicado),
            p_iva_porcentaje: form.iva_aplicado
              ? Number(form.iva_porcentaje || 0)
              : 0,
            p_irpf_aplicado: Boolean(form.irpf_aplicado),
            p_irpf_porcentaje: form.irpf_aplicado
              ? Number(form.irpf_porcentaje || 0)
              : 0,
            p_estado: form.estado,
          },
        );

        if (updateError) throw updateError;
        saved = Array.isArray(updatedData) ? updatedData[0] : updatedData;
      }

      if (pdfFile) {
        await uploadInvoicePdf(saved, pdfFile);
      }

      setLocation(`${basePath}/${saved.id}`);
    } catch (saveError: any) {
      console.error("[EmployeeBilling] Error creating invoice:", saveError);
      setError(saveError?.message || "No se pudo crear la factura.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <TopPageHeader eyebrow="Facturación" subtitle="Nueva factura" onOpenMenu={onOpenMenu} />

    <div className="space-y-6">
      <button
        type="button"
        onClick={() => setLocation(basePath)}
        className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a facturación
      </button>

      <div>
        <div className="mb-2 flex items-center gap-2 text-sm text-[#64748B]">
          <ReceiptText className="h-4 w-4 text-[#1E3A8A]" />
          <span>Operaciones</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>Facturación</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Crear factura
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500">
          Completa los datos comerciales y fiscales. El número de factura lo
          asignará automáticamente el backend.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <InvoiceEditor
        form={form}
        setForm={setForm}
        companies={companies}
        projects={projects}
        pdfFile={pdfFile}
        setPdfFile={setPdfFile}
        saving={saving}
        onCancel={() => setLocation(basePath)}
        onSave={save}
        creationMode
      />
    </div>
      </div>
    </div>
  );
}

function InvoiceEditor({
  form,
  setForm,
  companies,
  projects,
  pdfFile,
  setPdfFile,
  saving,
  onCancel,
  onSave,
  creationMode,
}: {
  form: InvoiceForm;
  setForm: Dispatch<SetStateAction<InvoiceForm>>;
  companies: any[];
  projects: any[];
  pdfFile: File | null;
  setPdfFile: (file: File | null) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  creationMode: boolean;
}) {
  const companyProjects = useMemo(
    () =>
      form.company_id
        ? projects.filter(
            (project) =>
              String(project.company_id) === String(form.company_id),
          )
        : [],
    [projects, form.company_id],
  );

  const servicesSubtotal = calculateSubtotal(form.servicios_incluidos);
  const enteredBase =
    String(form.precio_base ?? "").trim() !== ""
      ? Number(form.precio_base)
      : servicesSubtotal;

  const base = roundCurrency(Math.max(enteredBase || 0, 0));

  const fiscal = calculateFiscalAmounts(
    base,
    form.iva_aplicado,
    Number(form.iva_porcentaje || 0),
    form.irpf_aplicado,
    Number(form.irpf_porcentaje || 0),
  );

  const ivaRate = fiscal.ivaRate;
  const iva = fiscal.ivaImporte;
  const gross = fiscal.monto;
  const irpfRate = fiscal.irpfRate;
  const irpf = fiscal.irpfImporte;
  const payable = fiscal.importeAPagar;

  const update = <K extends keyof InvoiceForm>(
    key: K,
    value: InvoiceForm[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateService = (
    index: number,
    field: keyof ServiceLine,
    value: string,
  ) => {
    setForm((current) => {
      if (!current) return current;

      const lines = [...current.servicios_incluidos];
      lines[index] = {
        ...lines[index],
        [field]:
          field === "descripcion" ? value : Number(value || 0),
      };

      const nextSubtotal = calculateSubtotal(lines);

      return {
        ...current,
        servicios_incluidos: lines,
        precio_base: nextSubtotal.toFixed(2),
      };
    });
  };

  const addService = () => {
    setForm((current) =>
      current
        ? {
            ...current,
            servicios_incluidos: [
              ...current.servicios_incluidos,
              { descripcion: "", cantidad: 1, precio: 0 },
            ],
          }
        : current,
    );
  };

  const removeService = (index: number) => {
    setForm((current) => {
      if (!current) return current;

      const next = current.servicios_incluidos.filter(
        (_, itemIndex) => itemIndex !== index,
      );

      const safeLines =
        next.length > 0
          ? next
          : [{ descripcion: "", cantidad: 1, precio: 0 }];

      return {
        ...current,
        servicios_incluidos: safeLines,
        precio_base: calculateSubtotal(safeLines).toFixed(2),
      };
    });
  };

  const handlePdf = (file: File | null) => {
    if (!file) {
      setPdfFile(null);
      return;
    }

    if (!isPdfFile(file)) {
      window.alert("Solo se permiten archivos PDF.");
      return;
    }

    if (file.size <= 0) {
      window.alert("El PDF seleccionado está vacío.");
      return;
    }

    if (file.size > MAX_INVOICE_PDF_SIZE) {
      window.alert("El PDF no puede superar los 10 MB.");
      return;
    }

    setPdfFile(file);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Section title="Datos de la factura" icon={<FileText className="h-4 w-4" />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Empresa" required>
              <select
                value={form.company_id}
                onChange={(event) => {
  const companyId = event.target.value;
  const selectedCompany = companies.find(
    (company) => String(company.id) === String(companyId),
  );

  update("company_id", companyId);
  update("project_id", "");

  if (!selectedCompany) {
    update("iva_aplicado", true);
    update("iva_porcentaje", "21");
    return;
  }

  // Prioridad:
  // 1. IVA aprobado mediante solicitud del cliente
  // 2. IVA recomendado por el empleado
  // 3. 21 % por defecto

  if (selectedCompany.iva_aprobado_at) {
    update(
      "iva_aplicado",
      selectedCompany.iva_aprobado_aplicado === true,
    );

    update(
      "iva_porcentaje",
      selectedCompany.iva_aprobado_aplicado === true
        ? String(selectedCompany.iva_aprobado_porcentaje ?? 21)
        : "0",
    );

    return;
  }

  if (
    selectedCompany.iva_recomendado_aplicado === true &&
    Number.isFinite(
      Number(selectedCompany.iva_recomendado_porcentaje),
    )
  ) {
    update("iva_aplicado", true);
    update(
      "iva_porcentaje",
      String(selectedCompany.iva_recomendado_porcentaje),
    );

    return;
  }

  update("iva_aplicado", true);
  update("iva_porcentaje", "21");
}}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Selecciona una empresa</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.company_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Proyecto" required>
              <select
                value={form.project_id}
                onChange={(event) => update("project_id", event.target.value)}
                disabled={!form.company_id}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition disabled:bg-gray-50 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">
                  {form.company_id
                    ? "Selecciona un proyecto"
                    : "Selecciona primero una empresa"}
                </option>
                {companyProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.nombre}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Número de factura">
              <Input
                value={creationMode ? "Se generará automáticamente" : form.numero_factura}
                disabled
                className="h-10 bg-gray-50 text-gray-500"
              />
            </Field>

            <Field label="Estado">
              {form.estado === "pagada" ? (
                <div className="space-y-2">
                  <div className="flex h-10 items-center justify-between rounded-md border border-green-200 bg-green-50 px-3">
                    <span className="text-sm font-semibold text-green-700">
                      Pagada
                    </span>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </div>
                  <p className="text-xs leading-5 text-gray-500">
                    Una factura pagada solo puede alcanzar este estado mediante
                    un pago confirmado. No puede volver a otro estado.
                  </p>
                </div>
              ) : (
                <select
                  value={form.estado}
                  onChange={(event) =>
                    update("estado", event.target.value as InvoiceStatus)
                  }
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  {WORKER_EDITABLE_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Título" required className="sm:col-span-2">
              <Input
                value={form.titulo}
                onChange={(event) => update("titulo", event.target.value)}
                placeholder="Ej. Servicios de consultoría — septiembre"
                className="h-10"
              />
            </Field>

            <Field label="Fecha de emisión">
              <Input
                type="date"
                value={form.fecha_emision}
                onChange={(event) =>
                  update("fecha_emision", event.target.value)
                }
                className="h-10"
              />
            </Field>

            <Field label="Fecha de vencimiento">
              <Input
                type="date"
                value={form.fecha_vencimiento}
                onChange={(event) =>
                  update("fecha_vencimiento", event.target.value)
                }
                className="h-10"
              />
            </Field>

            <Field label="Descripción detallada" className="sm:col-span-2">
              <Textarea
                value={form.descripcion_detallada}
                onChange={(event) =>
                  update("descripcion_detallada", event.target.value)
                }
                placeholder="Describe el servicio o trabajo facturado..."
                rows={4}
              />
            </Field>
          </div>
        </Section>

        <Section
          title="Servicios incluidos"
          icon={<ReceiptText className="h-4 w-4" />}
          action={
            <button
              type="button"
              onClick={addService}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir línea
            </button>
          }
        >
          <div className="space-y-3">
            {form.servicios_incluidos.map((service, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-[minmax(0,1fr)_100px_130px_auto]"
              >
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Concepto
                  </label>
                  <Input
                    value={service.descripcion}
                    onChange={(event) =>
                      updateService(index, "descripcion", event.target.value)
                    }
                    placeholder="Servicio o concepto"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Cantidad
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={service.cantidad}
                    onChange={(event) =>
                      updateService(index, "cantidad", event.target.value)
                    }
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Precio unitario
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={service.precio}
                    onChange={(event) =>
                      updateService(index, "precio", event.target.value)
                    }
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeService(index)}
                    className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 sm:w-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sm:hidden">Eliminar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Fiscalidad" icon={<Calculator className="h-4 w-4" />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base imponible">
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precio_base}
                  onChange={(event) =>
                    update("precio_base", event.target.value)
                  }
                  className="h-10 pr-10"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  €
                </span>
              </div>
            </Field>

            <Field label="IVA">
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={form.iva_aplicado}
                    onChange={(event) => {
                      const applied = event.target.checked;
                      update("iva_aplicado", applied);
                      if (!applied) update("iva_porcentaje", "0");
                      else if (Number(form.iva_porcentaje || 0) === 0) update("iva_porcentaje", "21");
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-semibold text-gray-800">Aplicar IVA</span>
                </label>

                {form.iva_aplicado && (
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={form.iva_porcentaje}
                      onChange={(event) =>
                        update("iva_porcentaje", event.target.value)
                      }
                      className="h-10 pr-10"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      %
                    </span>
                  </div>
                )}
               

{form.company_id && (() => {
  const selectedCompany = companies.find(
    (company) => String(company.id) === String(form.company_id)
  );

  if (!selectedCompany) return null;

  const hasApprovedIva = Boolean(selectedCompany.iva_aprobado_at);

const hasRecommendation =
  selectedCompany.iva_recomendado_aplicado === true &&
  Number.isFinite(
    Number(selectedCompany.iva_recomendado_porcentaje),
  );

return (
  <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
    <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1E3A8A]" />

    <p className="text-xs leading-5 text-gray-600">
      {hasApprovedIva ? (
        <>
          <span className="font-semibold text-[#1E3A8A]">
            IVA aprobado para esta empresa:{" "}
            {selectedCompany.iva_aprobado_aplicado === true
              ? `${Number(selectedCompany.iva_aprobado_porcentaje)} %`
              : "No aplicado"}
            .
          </span>{" "}
          Este tratamiento procede de una solicitud revisada y aprobada.
          Puedes modificar el IVA de esta factura si la operación requiere
          un tratamiento fiscal diferente.
        </>
      ) : hasRecommendation ? (
        <>
          <span className="font-semibold text-[#1E3A8A]">
            IVA recomendado para esta empresa:{" "}
            {Number(selectedCompany.iva_recomendado_porcentaje)} %.
          </span>{" "}
          No existe un tratamiento aprobado por solicitud para esta empresa.
          Puedes modificar el IVA de esta factura si la operación requiere
          un tratamiento fiscal diferente.
        </>
      ) : (
        <>
          Esta empresa no tiene un tratamiento de IVA aprobado ni un IVA
          recomendado configurado. Se aplicará el 21 % como referencia
          inicial, que puedes modificar manualmente.
        </>
      )}
    </p>
  </div>
  );
})()}
              </div>
            </Field>

            <div className="rounded-lg border border-gray-200 p-4 sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.irpf_aplicado}
                  onChange={(event) => {
                    update("irpf_aplicado", event.target.checked);
                    if (!event.target.checked) update("irpf_porcentaje", "0");
                  }}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-800">
                    Aplicar retención de IRPF
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-gray-500">
                    La retención se calcula sobre la base fiscal del backend y
                    reduce el importe efectivamente exigible al cliente.
                  </span>
                </span>
              </label>

              {form.irpf_aplicado && (
                <div className="mt-4 max-w-xs">
                  <Field label="Porcentaje de IRPF">
                    <div className="relative">
                      <Input
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={form.irpf_porcentaje}
                        onChange={(event) =>
                          update("irpf_porcentaje", event.target.value)
                        }
                        className="h-10 pr-10"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                        %
                      </span>
                    </div>
                  </Field>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-gray-50 p-4 sm:col-span-2">
              <div className="space-y-2 text-sm">
                <TotalRow label="Base imponible" value={money(base)} />
                <TotalRow
                  label={form.iva_aplicado ? `IVA (${ivaRate.toFixed(2)}%)` : "IVA"}
                  value={form.iva_aplicado ? money(iva) : "No aplicado"}
                />
                <TotalRow label="Total bruto" value={money(gross)} strong />
                {form.irpf_aplicado && (
                  <TotalRow
                    label={`IRPF (${irpfRate.toFixed(2)}%)`}
                    value={`− ${money(irpf)}`}
                  />
                )}
                <div className="border-t border-gray-200 pt-2">
                  <TotalRow
                    label="Importe a pagar"
                    value={money(payable)}
                    strong
                    emphasized
                  />
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Notas" icon={<FileText className="h-4 w-4" />}>
          <Textarea
            value={form.notas}
            onChange={(event) => update("notas", event.target.value)}
            placeholder="Notas internas o información adicional de la factura..."
            rows={4}
          />
        </Section>

        <Section title="Documento PDF" icon={<Upload className="h-4 w-4" />}>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-5 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50/30">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#1E3A8A] shadow-none">
              <Upload className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-gray-800">
              {pdfFile ? pdfFile.name : "Adjuntar factura en PDF"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Solo PDF · máximo 10 MB
            </p>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) =>
                handlePdf(event.target.files?.[0] || null)
              }
            />
          </label>

          {pdfFile && (
            <button
              type="button"
              onClick={() => setPdfFile(null)}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
            >
              <X className="h-3.5 w-3.5" />
              Quitar archivo seleccionado
            </button>
          )}
        </Section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1E3A8A] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#162D6B] disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {creationMode ? "Crear factura" : "Guardar cambios"}
          </button>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="border-gray-200 bg-white shadow-none">
          <div className="border-b border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-900">
              Vista previa del importe
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              La vista previa replica la misma secuencia de cálculo que
              utiliza el backend: IVA sobre la base, IRPF sobre la base
              imponible y, finalmente, importe a pagar.
            </p>
          </div>

          <div className="space-y-3 p-4">
            <TotalRow label="Base imponible" value={money(base)} />
            <TotalRow
              label={form.iva_aplicado ? `IVA (${ivaRate.toFixed(2)}%)` : "IVA"}
              value={form.iva_aplicado ? money(iva) : "No aplicado"}
            />
            <TotalRow label="Total bruto" value={money(gross)} strong />
            {form.irpf_aplicado && (
              <TotalRow
                label={`IRPF (${irpfRate.toFixed(2)}%)`}
                value={`− ${money(irpf)}`}
              />
            )}
            <div className="border-t border-gray-200 pt-3">
              <TotalRow
                label="A pagar"
                value={money(payable)}
                strong
                emphasized
              />
            </div>
          </div>
        </div>

        <div className="border-blue-100 bg-blue-50/60 shadow-none">
          <div className="flex gap-3 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1E3A8A]" />
            <div>
              <p className="text-sm font-semibold text-[#1E3A8A]">
                Reglas del backend
              </p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-gray-600">
                <li>• El número de factura no se introduce manualmente.</li>
                <li>• Empresa y proyecto se validan conjuntamente.</li>
                <li>• IVA, IRPF, bruto y a pagar se recalculan en BD.</li>
                <li>• Las modificaciones usan la RPC del worker.</li>
                <li>• El PDF utiliza almacenamiento privado.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="border-gray-200 bg-white shadow-none">
          <div className="p-4">
            <p className="text-sm font-semibold text-gray-900">
              Cobros con Stripe
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Los pagos Stripe no se crean ni modifican desde este formulario.
              El backend registra los intentos y, cuando corresponde, marca la
              factura como pagada.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ============================================================================
   NAVEGACIÓN DEL ÁREA DE EMPLEADOS — MISMO DISEÑO QUE PRESUPUESTOS
   ========================================================================== */

function EmployeeBillingNavigation({
  open,
  location,
  employeeRoot,
  billingBase,
  onClose,
  onNavigate,
}: {
  open: boolean;
  location: string;
  employeeRoot: string;
  billingBase: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const groups: Array<{
    title: string;
    items: Array<{
      id: string;
      label: string;
      icon: ComponentType<{
        className?: string;
        strokeWidth?: number;
      }>;
    }>;
  }> = [
    {
      title: "Principal",
      items: [{ id: "dashboard", label: "Dashboard", icon: BarChart3 }],
    },
    {
      title: "Gestión",
      items: [
        { id: "projects", label: "Proyectos", icon: FolderKanban },
        { id: "companies", label: "Empresas", icon: Building2 },
        { id: "quotations", label: "Presupuestos", icon: FileText },
        { id: "billing", label: "Facturación", icon: CreditCard },
        { id: "payments", label: "Pagos", icon: CircleDollarSign },
        { id: "support", label: "Tickets", icon: Ticket },
      ],
    },
    {
      title: "Comunicación",
      items: [
        { id: "ai", label: "Conversaciones IA", icon: Zap },
        { id: "notifications", label: "Notificaciones", icon: Bell },
      ],
    },
    {
      title: "Operaciones",
      items: [
        { id: "activity", label: "Actividad", icon: Activity },
        { id: "audits", label: "Auditorías", icon: FileText },
        { id: "companyChanges", label: "Cambios de empresa", icon: Building2 },
        { id: "maintenance", label: "Contratos de mantenimiento", icon: CalendarDays },
      ],
    },
    {
      title: "Automatización",
      items: [
        { id: "automations", label: "Automatizaciones", icon: Zap },
        { id: "automationRuns", label: "Ejecuciones", icon: RefreshCw },
      ],
    },
  ];

  const isActive = (id: string) => {
    if (id === "billing") {
      return location === billingBase || location.startsWith(`${billingBase}/`);
    }
    if (id === "dashboard") {
      return location === employeeRoot || location === `${employeeRoot}/`;
    }
    return (
      location === `${employeeRoot}/${id}` ||
      location.startsWith(`${employeeRoot}/${id}/`)
    );
  };

  return (
    <aside
      className={[
        "fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[86vw]",
        "flex-col border-r border-[#E6E9EE] bg-white",
        "transition-transform duration-200 ease-out",
        open ? "translate-x-0" : "-translate-x-full",
      ].join(" ")}
      aria-hidden={!open}
    >
      <div className="flex h-[72px] items-center justify-between border-b border-[#EEF1F4] px-6">
        <div>
          <p className="text-lg font-semibold tracking-[-0.025em] text-[#172033]">MODIRA</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9AA2AE]">Operaciones</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#7B8594] transition-colors hover:bg-[#F6F7F9] hover:text-[#172033]"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" strokeWidth={1.7} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">{group.title}</p>
              <div className="mt-2 space-y-1">
                {group.items.map((item) => {
                  const active = isActive(item.id);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      className={[
                        "flex w-full items-center gap-3 rounded-lg",
                        "px-3 py-2.5 text-left text-sm",
                        "transition-colors",
                        active
                          ? "bg-[#EEF3FF] font-semibold text-[#1E3A8A]"
                          : "font-medium text-[#536074] hover:bg-[#F6F7F9] hover:text-[#172033]",
                      ].join(" ")}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-[#EEF1F4] px-6 py-5">
        <p className="text-xs text-[#8A94A4]">Sesión de trabajador interno</p>
        <p className="mt-1 truncate text-sm font-medium text-[#344154]">Modira</p>
      </div>
    </aside>
  );
}

function TopPageHeader({
  eyebrow,
  subtitle,
  onOpenMenu,
}: {
  eyebrow: string;
  subtitle: string;
  onOpenMenu: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <button
        type="button"
        onClick={onOpenMenu}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#5F6B7C] transition-colors hover:bg-white hover:text-[#172033]"
        aria-label="Abrir menú de navegación"
      >
        <Menu className="h-5 w-5" strokeWidth={1.7} />
      </button>
      <div className="hidden flex-1 sm:block">
        <p className="text-sm font-semibold text-[#263044]">{eyebrow}</p>
        <p className="text-xs text-[#939CAA]">{subtitle}</p>
      </div>
    </div>
  );
}

function PageShell({
  title,
  subtitle,
  onOpenMenu,
  children,
}: {
  title: string;
  subtitle: string;
  onOpenMenu: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <TopPageHeader eyebrow={title} subtitle={subtitle} onOpenMenu={onOpenMenu} />
        {children}
      </div>
    </div>
  );
}

function PageLoading({ text }: { text: string }) {
  return (
    <div className="border border-slate-200 bg-white">
      <div className="flex min-h-[420px] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]" />
        <p className="mt-4 text-sm font-medium text-slate-600">{text}</p>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
        <div>
          <p className="font-semibold text-red-800">No se pudo cargar</p>
          <p className="mt-1 text-sm text-red-700">{message}</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyInvoices({
  hasFilters,
  onCreate,
}: {
  hasFilters: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="border-y border-gray-200">
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">
          <ReceiptText className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-gray-900">
          {hasFilters ? "No hay facturas que coincidan" : "Todavía no hay facturas"}
        </h3>
        <p className="mt-1 max-w-md text-sm text-gray-500">
          {hasFilters
            ? "Prueba a cambiar los filtros o la búsqueda."
            : "Crea la primera factura para empezar a gestionar la facturación."}
        </p>
        {!hasFilters && (
          <button
            type="button"
            onClick={onCreate}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Crear factura
          </button>
        )}
      </div>
    </div>
  );
}
function MetricCard({
  icon,
  label,
  value,
  helper,
  emphasized,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div
      className={[
        "border border-slate-200 bg-white p-4",
        emphasized ? "border-blue-200" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-800">{value}</p>
          {helper && <p className="mt-1 text-xs text-slate-400">{helper}</p>}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">{icon}</div>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 max-w-[210px] rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-gray-200 pb-6">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[#1E3A8A]">{icon}</span>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        </div>
        {action}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
  className = "",
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-semibold text-gray-600">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function InfoBlock({
  icon,
  label,
  value,
  secondary,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 text-gray-400">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold text-gray-800">
          {value}
        </p>
        {secondary && (
          <p className="mt-0.5 break-all text-xs text-gray-500">{secondary}</p>
        )}
      </div>
    </div>
  );
}

function InfoMini({
  label,
  value,
  strong,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-gray-500">{label}</p>
      <p className={`mt-0.5 truncate ${strong ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>
        {value}
      </p>
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong,
  emphasized,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        emphasized ? "text-[#1E3A8A]" : ""
      }`}
    >
      <span className={strong ? "font-semibold" : "text-gray-600"}>
        {label}
      </span>
      <span
        className={
          strong
            ? `font-bold ${emphasized ? "text-lg" : "text-gray-900"}`
            : "font-medium text-gray-800"
        }
      >
        {value}
      </span>
    </div>
  );
}
