import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, Dispatch, SetStateAction, ComponentType } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ArrowUpDown,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Calculator,
  Check,
  Info,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Filter,
  FolderKanban,
  Loader2,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  Trash2,
  Upload,
  User,
  X,
  Activity,
  Zap,
  ReceiptText,
} from "lucide-react";

import { toast } from "sonner";

/* ============================================================================
   TIPOS
   ========================================================================== */

type QuotationStatus = "Pendiente" | "Aceptado" | "Rechazado";
interface Company {
  id: string;
  company_name: string;
  iva_recomendado_aplicado?: boolean;
  iva_recomendado_porcentaje?: number | null;
  iva_aprobado_aplicado?: boolean;
  iva_aprobado_porcentaje?: number | null;
  iva_aprobado_at?: string | null;
}

interface Project {
  id: string;
  nombre: string;
  company_id: string | null;
  client_id: string | null;
  user_id: string | null;
  estado?: string | null;
}

interface Client {
  id: string;
  nombre: string;
  company_id: string | null;
  email?: string | null;
  profile_id?: string | null;
}

interface Profile {
  id: string;
  nombre: string | null;
  email: string | null;
  company_id: string | null;
}

interface QuotationService {
  descripcion: string;
  cantidad: number;
  precio: number;
}

interface Quotation {
  id: string;
  company_id: string;
  user_id: string;
  project_id: string | null;
  client_id: string | null;

  numero_presupuesto: string;
  titulo: string;
  descripcion_detallada: string | null;

  servicios_incluidos: QuotationService[];

  precio_base: number;
  iva_porcentaje: number;
  precio_total: number;
  irpf_aplicado: boolean;
  irpf_porcentaje: number;
  irpf_importe: number;

  estado: QuotationStatus;

  fecha_emision: string;
  fecha_validez: string | null;

  notas: string | null;
  document_path: string | null;

  stripe_session_id?: string | null;

  created_at: string;
  updated_at: string;
}

interface QuotationForm {
  company_id: string;
  project_id: string;
  client_id: string;

  numero_presupuesto: string;
  titulo: string;
  descripcion_detallada: string;

  servicios_incluidos: QuotationService[];

  iva_porcentaje: string;
  irpf_aplicado: boolean;
  irpf_porcentaje: string;
  estado: QuotationStatus;

  fecha_emision: string;
  fecha_validez: string;

  notas: string;
}

type SortOption =
  | "recent"
  | "oldest"
  | "amount_high"
  | "amount_low"
  | "validity";

interface EmployeeQuotationsProps {
  onCreateQuotation?: () => void;
  basePath?: string;
  onMenuNavigate?: (id: string) => void;
}

/* ============================================================================
   CONSTANTES
   ========================================================================== */

const EMPTY_SERVICE: QuotationService = {
  descripcion: "",
  cantidad: 1,
  precio: 0,
};

async function assertActiveWorker() {
  const { data, error } = await supabase.rpc(
    "current_user_is_worker"
  );

  if (error) {
    throw error;
  }

  if (data !== true) {
    throw new Error(
      "La sesión actual no corresponde a un trabajador activo de Modira."
    );
  }
}

const STATUS_OPTIONS: Array<{
  value: "all" | QuotationStatus;
  label: string;
}> = [
  {
    value: "all",
    label: "Todos los estados",
  },
  {
    value: "Pendiente",
    label: "Pendiente",
  },
  {
    value: "Aceptado",
    label: "Aceptado",
  },
  {
    value: "Rechazado",
    label: "Rechazado",
  },
];

const SORT_OPTIONS: Array<{
  value: SortOption;
  label: string;
}> = [
  {
    value: "recent",
    label: "Más recientes",
  },
  {
    value: "oldest",
    label: "Más antiguos",
  },
  {
    value: "amount_high",
    label: "Mayor importe",
  },
  {
    value: "amount_low",
    label: "Menor importe",
  },
  {
    value: "validity",
    label: "Fecha de validez",
  },
];
async function uploadPdfForQuotation(
  targetQuotation: Quotation,
  file: File
) {
  await assertActiveWorker();

  if (!targetQuotation?.id) {
    throw new Error(
      "El presupuesto no es válido."
    );
  }

  if (!targetQuotation.company_id) {
    throw new Error(
      "El presupuesto no tiene una empresa asociada."
    );
  }

  if (!targetQuotation.numero_presupuesto) {
    throw new Error(
      "El presupuesto no tiene número de presupuesto."
    );
  }

  const isPdfByMime =
    file.type === "application/pdf";

  const isPdfByExtension =
    file.name
      .toLowerCase()
      .endsWith(".pdf");

  if (!isPdfByMime && !isPdfByExtension) {
    throw new Error(
      "Solo se permiten archivos PDF."
    );
  }

  if (file.size <= 0) {
    throw new Error(
      "El archivo está vacío."
    );
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error(
      "El PDF no puede superar los 10 MB."
    );
  }

  /*
   * Migración 008:
   *
   * <company_id>/<numero_presupuesto>.pdf
   *
   * Las policies endurecidas de Storage comprueban que
   * la ruta corresponda realmente con un presupuesto existente.
   */
  const path =
    `${targetQuotation.company_id}/${targetQuotation.numero_presupuesto}.pdf`;

  const {
    error: uploadError,
  } = await supabase.storage
    .from("quotations")
    .upload(
      path,
      file,
      {
        upsert: true,
        contentType: "application/pdf",
      }
    );

  if (uploadError) {
    throw uploadError;
  }

  /*
   * La RPC comprueba:
   * - worker activo
   * - presupuesto existente
   * - ruta exacta esperada
   * - existencia real del objeto en Storage
   *
   * y actualiza quotations.document_path.
   */
  const {
  error: attachError,
} = await supabase.rpc(
  "attach_quotation_document",
  {
    p_quotation_id:
      targetQuotation.id,
    p_document_path:
      path,
  }
);
if (attachError) {
  throw attachError;
}

const {
  data: hashData,
  error: hashError,
} = await supabase.functions.invoke(
  "set-quotation-document-hash",
  {
    body: {
      quotationId: targetQuotation.id,
    },
  },
);

if (hashError) {
  console.error(
    "[EmployeeQuotations] Error generando hash del PDF:",
    hashError,
  );

  throw new Error(
    hashError.message ||
      "No se pudo preparar la seguridad del PDF del presupuesto.",
  );
}

if (!hashData?.success || !hashData?.documentSha256) {
  throw new Error(
    "El PDF se ha subido, pero no se ha podido registrar su hash de seguridad.",
  );


  }
}
/* ============================================================================
   COMPONENTE PRINCIPAL
   ========================================================================== */


   
export default function EmployeeQuotations({
  onCreateQuotation,
  basePath = "/employee/quotations",
  onMenuNavigate,
}: EmployeeQuotationsProps) {
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const base =
    basePath.replace(/\/+$/, "") || "/employee/quotations";

  const employeeRoot =
    base.replace(/\/quotations$/, "") || "/employee";

  const quotationId = getQuotationIdFromPath(location, base);
  const isNew = isNewQuotationRoute(location, base);

  const navigateFromMenu = useCallback(
    (id: string) => {
      setMenuOpen(false);

      if (onMenuNavigate) {
        onMenuNavigate(id);
        return;
      }

      const pathMap: Record<string, string> = {
        dashboard: employeeRoot,

        projects: `${employeeRoot}/projects`,
        companies: `${employeeRoot}/companies`,
        quotations: base,
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

      const target = pathMap[id];

      if (target) {
        setLocation(target);
      }
    },
    [
      base,
      employeeRoot,
      onMenuNavigate,
      setLocation,
    ]
  );

  const navigation = (
    <EmployeeQuotationsNavigation
      open={menuOpen}
      location={location}
      employeeRoot={employeeRoot}
      quotationBase={base}
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

  if (isNew) {
    return (
      <>
        {navigation}
        {overlay}

        <QuotationCreate
          basePath={base}
          employeeRoot={employeeRoot}
          onBack={() => setLocation(base)}
          onOpenMenu={() => setMenuOpen(true)}
          onCreated={(id) => {
            const detailUrl = `${window.location.origin}${base}/${id}`;

            const opened = window.open(
              detailUrl,
              "_blank",
              "noopener,noreferrer"
            );

            if (!opened) {
              setLocation(`${base}/${id}`);
            }
          }}
        />
      </>
    );
  }

  if (quotationId) {
    return (
      <>
        {navigation}
        {overlay}

        <QuotationDetail
          quotationId={quotationId}
          basePath={base}
          onBack={() => setLocation(base)}
          onOpenMenu={() => setMenuOpen(true)}
        />
      </>
    );
  }

  return (
    <>
      {navigation}
      {overlay}

      <QuotationList
        basePath={base}
        employeeRoot={employeeRoot}
        onOpenMenu={() => setMenuOpen(true)}
        onCreateQuotation={() => {
          if (onCreateQuotation) {
            onCreateQuotation();
            return;
          }

          setLocation(`${base}/new`);
        }}
        onOpen={(quotation) => {
          const detailUrl = `${window.location.origin}${base}/${quotation.id}`;

          const opened = window.open(
            detailUrl,
            "_blank",
            "noopener,noreferrer"
          );

          if (!opened) {
            setLocation(`${base}/${quotation.id}`);
          }
        }}
      />
    </>
  );
}

/* ============================================================================
   MENÚ LATERAL — IDÉNTICO AL DE PROJECTS
   ========================================================================== */

function EmployeeQuotationsNavigation({
  open,
  location,
  employeeRoot,
  quotationBase,
  onClose,
  onNavigate,
}: {
  open: boolean;
  location: string;
  employeeRoot: string;
  quotationBase: string;
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
      items: [
        {
          id: "dashboard",
          label: "Dashboard",
          icon: BarChart3,
        },
      ],
    },

    {
      title: "Gestión",
      items: [
        {
          id: "projects",
          label: "Proyectos",
          icon: FolderKanban,
        },
        {
          id: "companies",
          label: "Empresas",
          icon: Building2,
        },
        {
          id: "quotations",
          label: "Presupuestos",
          icon: FileText,
        },
        {
          id: "billing",
          label: "Facturación",
          icon: CreditCard,
        },
        {
          id: "payments",
          label: "Pagos",
          icon: CircleDollarSign,
        },
        {
          id: "support",
          label: "Tickets",
          icon: Ticket,
        },
      ],
    },

    {
      title: "Comunicación",
      items: [
        {
          id: "ai",
          label: "Conversaciones IA",
          icon: Zap,
        },
        {
          id: "notifications",
          label: "Notificaciones",
          icon: Bell,
        },
      ],
    },

    {
      title: "Operaciones",
      items: [
        {
          id: "activity",
          label: "Actividad",
          icon: Activity,
        },
        {
          id: "audits",
          label: "Auditorías",
          icon: FileText,
        },
        {
          id: "companyChanges",
          label: "Cambios de empresa",
          icon: Building2,
        },
        {
          id: "maintenance",
          label: "Contratos de mantenimiento",
          icon: CalendarDays,
        },
      ],
    },

    {
      title: "Automatización",
      items: [
        {
          id: "automations",
          label: "Automatizaciones",
          icon: Zap,
        },
        {
          id: "automationRuns",
          label: "Ejecuciones",
          icon: RefreshCw,
        },
      ],
    },
  ];

  const isActive = (id: string) => {
    if (id === "quotations") {
      return (
        location === quotationBase ||
        location.startsWith(`${quotationBase}/`)
      );
    }

    if (id === "dashboard") {
      return (
        location === employeeRoot ||
        location === `${employeeRoot}/`
      );
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
        open
          ? "translate-x-0"
          : "-translate-x-full",
      ].join(" ")}
      aria-hidden={!open}
    >
      <div className="flex h-[72px] items-center justify-between border-b border-[#EEF1F4] px-6">
        <div>
          <p className="text-lg font-semibold tracking-[-0.025em] text-[#172033]">
            MODIRA
          </p>

          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9AA2AE]">
            Operaciones
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#7B8594] transition-colors hover:bg-[#F6F7F9] hover:text-[#172033]"
          aria-label="Cerrar menú"
        >
          <X
            className="h-5 w-5"
            strokeWidth={1.7}
          />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">
                {group.title}
              </p>

              <div className="mt-2 space-y-1">
                {group.items.map((item) => {
                  const active = isActive(item.id);
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        onNavigate(item.id)
                      }
                      className={[
                        "flex w-full items-center gap-3 rounded-lg",
                        "px-3 py-2.5 text-left text-sm",
                        "transition-colors",

                        active
                          ? "bg-[#EEF3FF] font-semibold text-[#1E3A8A]"
                          : "font-medium text-[#536074] hover:bg-[#F6F7F9] hover:text-[#172033]",
                      ].join(" ")}
                      aria-current={
                        active
                          ? "page"
                          : undefined
                      }
                    >
                      <Icon
                        className="h-4 w-4 shrink-0"
                        strokeWidth={1.8}
                      />

                      <span className="truncate">
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-[#EEF1F4] px-6 py-5">
        <p className="text-xs text-[#8A94A4]">
          Sesión de trabajador interno
        </p>

        <p className="mt-1 truncate text-sm font-medium text-[#344154]">
          Modira
        </p>
      </div>
    </aside>
  );
}

/* ============================================================================
   LISTADO
   ========================================================================== */

function QuotationList({
  basePath,
  employeeRoot,
  onCreateQuotation,
  onOpen,
  onOpenMenu,
}: {
  basePath: string;
  employeeRoot: string;
  onCreateQuotation: () => void;
  onOpen: (quotation: Quotation) => void;
  onOpenMenu: () => void;
}) {
  const { user } = useAuth();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | QuotationStatus>("all");
  const [sort, setSort] = useState<SortOption>("recent");
  const [, setLocation] = useLocation();

  const loadData = useCallback(async (silent = false) => {
    if (!user) {
      setLoading(false);
      setQuotations([]);
      return;
    }

    try {
      if (silent) setRefreshing(true);
      else setLoading(true);

      const [quotationResult, companyResult, projectResult] = await Promise.all([
        supabase
          .from("quotations")
          .select([
            "id",
            "company_id",
            "user_id",
            "project_id",
            "client_id",
            "numero_presupuesto",
            "titulo",
            "descripcion_detallada",
            "servicios_incluidos",
            "precio_base",
            "iva_porcentaje",
            "precio_total",
            "irpf_aplicado",
            "irpf_porcentaje",
            "irpf_importe",
            "estado",
            "fecha_emision",
            "fecha_validez",
            "notas",
            "document_path",
            "stripe_session_id",
            "created_at",
            "updated_at",
          ].join(", "))
          .order("created_at", { ascending: false }),
        supabase.from("companies").select("id, company_name").order("company_name", { ascending: true }),
        supabase.from("projects").select("id, nombre, company_id, client_id, user_id, estado").order("nombre", { ascending: true }),
      ]);

      if (quotationResult.error) throw quotationResult.error;
      if (companyResult.error) throw companyResult.error;
      if (projectResult.error) throw projectResult.error;

      setQuotations((quotationResult.data || []) as unknown as Quotation[]);
      setCompanies((companyResult.data || []) as Company[]);
      setProjects((projectResult.data || []) as Project[]);
    } catch (err: any) {
      console.error("[EmployeeQuotations] Load error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const visibleProjects = useMemo(
    () =>
      companyFilter === "all"
        ? projects.filter((project) => quotations.some((quotation) => quotation.project_id === project.id))
        : projects.filter((project) => String(project.company_id) === String(companyFilter)),
    [projects, quotations, companyFilter],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...quotations]
      .filter((quotation) => {
        const company = companies.find((item) => String(item.id) === String(quotation.company_id));
        const project = projects.find((item) => String(item.id) === String(quotation.project_id));
        const searchValues = [
          quotation.numero_presupuesto,
          quotation.titulo,
          quotation.descripcion_detallada,
          company?.company_name,
          project?.nombre,
        ];

        const searchMatch = !query || searchValues.some((value) => String(value || "").toLowerCase().includes(query));
        const companyMatch = companyFilter === "all" || String(quotation.company_id) === String(companyFilter);
        const projectMatch = projectFilter === "all" || String(quotation.project_id) === String(projectFilter);
        const statusMatch = statusFilter === "all" || quotation.estado === statusFilter;

        return searchMatch && companyMatch && projectMatch && statusMatch;
      })
      .sort((a, b) => {
        if (sort === "amount_high") return Number(b.precio_total || 0) - Number(a.precio_total || 0);
        if (sort === "amount_low") return Number(a.precio_total || 0) - Number(b.precio_total || 0);
        if (sort === "validity") return new Date(a.fecha_validez || "9999-12-31").getTime() - new Date(b.fecha_validez || "9999-12-31").getTime();
        const dateA = new Date(a.created_at || a.fecha_emision || 0).getTime();
        const dateB = new Date(b.created_at || b.fecha_emision || 0).getTime();
        return sort === "oldest" ? dateA - dateB : dateB - dateA;
      });
  }, [quotations, companies, projects, search, companyFilter, projectFilter, statusFilter, sort]);

  const metrics = useMemo(() => {
    const total = filtered.length;
    const pending = filtered.filter((quotation) => quotation.estado === "Pendiente").length;
    const accepted = filtered.filter((quotation) => quotation.estado === "Aceptado").length;
    const rejected = filtered.filter((quotation) => quotation.estado === "Rechazado").length;
    const totalValue = filtered.reduce((sum, quotation) => sum + Number(quotation.precio_total || 0), 0);
    const acceptedValue = filtered
      .filter((quotation) => quotation.estado === "Aceptado")
      .reduce((sum, quotation) => sum + Number(quotation.precio_total || 0), 0);

    return { total, pending, accepted, rejected, totalValue, acceptedValue };
  }, [filtered]);

  const companyName = (id: string) => companies.find((company) => String(company.id) === String(id))?.company_name || "Sin empresa";
  const projectName = (id: string | null) => projects.find((project) => String(project.id) === String(id))?.nombre || "Sin proyecto";

  if (loading) {
    return <PageShell title="Presupuestos" subtitle="Cargando presupuestos..." onOpenMenu={onOpenMenu}><PageLoading text="Cargando presupuestos..." /></PageShell>;
  }

  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-5 sm:p-6 lg:p-8">
        <TopPageHeader eyebrow="Presupuestos" subtitle="Gestión de presupuestos y propuestas" onOpenMenu={onOpenMenu} />

        <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-gray-500"><FileText className="h-4 w-4" />Gestión comercial</div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1E3A8A]">Presupuestos</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">Gestiona propuestas, servicios, fiscalidad, validez y documentación desde un único espacio.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => loadData(true)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Actualizar
            </button>
            <button type="button" onClick={onCreateQuotation} className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white shadow-none transition hover:bg-[#162D6B]">
              <Plus className="h-4 w-4" />Crear presupuesto
            </button>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <MetricCard icon={<FileText className="h-4 w-4" />} label="Presupuestos" value={metrics.total} />
          <MetricCard icon={<Clock3 className="h-4 w-4" />} label="Pendientes" value={metrics.pending} />
          <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Aceptados" value={metrics.accepted} />
          <MetricCard icon={<AlertCircle className="h-4 w-4" />} label="Rechazados" value={metrics.rejected} />
          <MetricCard icon={<Calculator className="h-4 w-4" />} label="Total presupuestado" value={money(metrics.totalValue)} />
          <MetricCard icon={<CircleDollarSign className="h-4 w-4" />} label="Valor aceptado" value={money(metrics.acceptedValue)} />
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
          setStatusFilter(value as "all" | QuotationStatus)
        }
        options={[
          { value: "all", label: "Todos los estados" },
          ...STATUS_OPTIONS
            .filter((option) => option.value !== "all")
            .map((option) => ({
              value: option.value,
              label: option.label,
            })),
        ]}
      />

      <FilterSelect
  value={sort}
  onChange={(value) => setSort(value as SortOption)}
  options={[
          { value: "recent", label: "Más recientes" },
          { value: "oldest", label: "Más antiguas" },
          { value: "amount_high", label: "Mayor importe" },
          { value: "amount_low", label: "Menor importe" },
          { value: "validity", label: "Próxima validez" },
        ]}
      />
    </div>
  </div>
</div>

{filtered.length === 0 ? (
  <EmptyInvoices
    hasFilters={Boolean(
      search ||
        companyFilter !== "all" ||
        projectFilter !== "all" ||
        statusFilter !== "all",
    )}
    onCreate={onCreateQuotation}
  />
) : (
  <>
    <div className="hidden overflow-hidden border-gray-200 bg-white shadow-none md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-5 py-3">Presupuesto</th>
              <th className="px-5 py-3">Empresa / proyecto</th>
              <th className="px-5 py-3">Emisión</th>
              <th className="px-5 py-3">Validez</th>
              <th className="px-5 py-3">Importe</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right"></th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {filtered.map((quotation) => {
              const expired =
                quotation.estado === "Pendiente" &&
                isExpired(quotation.fecha_validez);

              return (
                <tr
                  key={quotation.id}
                  onClick={() => onOpen(quotation)}
                  className="cursor-pointer transition hover:bg-gray-50/80"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1E3A8A]">
                        <FileText className="h-4 w-4" />
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">
                          {quotation.numero_presupuesto || "Sin número"}
                        </p>

                        <p className="mt-0.5 max-w-[240px] truncate text-xs text-gray-500">
                          {quotation.titulo || "Sin título"}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <p className="font-medium text-gray-800">
                      {companyName(quotation.company_id)}
                    </p>

                    <p className="mt-0.5 text-xs text-gray-500">
                      {projectName(quotation.project_id)}
                    </p>
                  </td>

                  <td className="px-5 py-4 text-gray-600">
                    {dateLabel(quotation.fecha_emision)}
                  </td>

                  <td className="px-5 py-4">
                    <p
                      className={`text-gray-600 ${
                        expired ? "font-semibold text-red-600" : ""
                      }`}
                    >
                      {dateLabel(quotation.fecha_validez)}
                    </p>

                    {expired && (
                      <p className="mt-0.5 text-xs font-medium text-red-500">
                        Vencido
                      </p>
                    )}
                  </td>

                  <td className="px-5 py-4 font-semibold text-gray-900">
                    {money(quotation.precio_total)}
                  </td>

                  <td className="px-5 py-4">
                    <QuotationStatusBadge status={quotation.estado} />
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
      {filtered.map((quotation) => {
        const expired =
          quotation.estado === "Pendiente" &&
          isExpired(quotation.fecha_validez);

        return (
          <button
            type="button"
            key={quotation.id}
            onClick={() => onOpen(quotation)}
            className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-none transition hover:border-gray-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1E3A8A]">
                  <FileText className="h-4 w-4" />
                </div>

                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">
                    {quotation.numero_presupuesto || "Sin número"}
                  </p>

                  <p className="truncate text-xs text-gray-500">
                    {quotation.titulo || "Sin título"}
                  </p>
                </div>
              </div>

              <QuotationStatusBadge status={quotation.estado} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs">
              <InfoMini
                label="Empresa"
                value={companyName(quotation.company_id)}
              />

              <InfoMini
                label="Proyecto"
                value={projectName(quotation.project_id)}
              />

              <InfoMini
                label="Validez"
                value={
                  expired
                    ? "Vencido"
                    : dateLabel(quotation.fecha_validez)
                }
              />

              <InfoMini
                label="Total"
                value={money(quotation.precio_total)}
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
    Mostrando {filtered.length} de {quotations.length} presupuestos
  </span>

  <span className="hidden sm:inline">
    La numeración del presupuesto la genera el backend.
  </span>
</div>      </div>
    </div>
  );
}

/* ============================================================================
   CREACIÓN
   ========================================================================== */

function QuotationCreate({
  basePath,
  employeeRoot,
  onBack,
  onCreated,
  onOpenMenu,
}: {
  basePath: string;
  employeeRoot: string;
  onBack: () => void;
  onCreated: (id: string) => void;
  onOpenMenu: () => void;
}) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<QuotationForm>(emptyQuotationForm());
  const [selectedPdf, setSelectedPdf] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadOptions = async () => {
      try {
        const [companyResult, projectResult] = await Promise.all([
          supabase
  .from("companies")
  .select(
  "id, company_name, iva_recomendado_aplicado, iva_recomendado_porcentaje, iva_aprobado_aplicado, iva_aprobado_porcentaje, iva_aprobado_at"
)
  .order("company_name", { ascending: true }),
          supabase.from("projects").select("id, nombre, company_id, client_id, user_id, estado").order("nombre", { ascending: true }),
        ]);

        if (companyResult.error) throw companyResult.error;
        if (projectResult.error) throw projectResult.error;
        if (cancelled) return;

        setCompanies((companyResult.data || []) as Company[]);
        setProjects((projectResult.data || []) as Project[]);
      } catch (err: any) {
        console.error("[EmployeeQuotations] Create options error:", err);
        if (!cancelled) setError(err?.message || "No se pudieron cargar las opciones necesarias.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadOptions();
    return () => { cancelled = true; };
  }, [user]);

  const availableProjects = useMemo(() => {
  if (!form.company_id) return [];
  return projects.filter(
    (project) => project.company_id === form.company_id
  );
}, [projects, form.company_id]);

  const selectedProject = projects.find((project) => project.id === form.project_id) || null;
  const services = cleanServices(form.servicios_incluidos);
  const subtotal = calculateSubtotal(services);
  const iva = Number(form.iva_porcentaje || 0);
  const fiscal = calculateQuotationFiscalAmounts(subtotal, iva, form.irpf_aplicado, Number(form.irpf_porcentaje || 0));
  const ivaAmount = fiscal.ivaImporte;
  const total = fiscal.total;
  const irpfAmount = fiscal.irpfImporte;

  const save = async () => {
    setError(null);

    if (!user) return setError("No hay una sesión de trabajador activa.");

    try {
      await assertActiveWorker();
    } catch (err: any) {
      console.error("[EmployeeQuotations] Worker authorization error:", err);
      return setError(
        err?.message ||
          "La sesión actual no corresponde a un trabajador activo de Modira."
      );
    }

    if (!form.company_id) return setError("Selecciona una empresa.");
    if (!form.project_id) return setError("Selecciona un proyecto.");
    if (!selectedProject) return setError("El proyecto seleccionado no existe.");
    if (String(selectedProject.company_id || "") !== String(form.company_id)) {
      return setError("El proyecto no pertenece a la empresa seleccionada.");
    }
    if (!selectedProject.user_id) {
  return setError("El proyecto seleccionado no tiene un usuario asociado.");
}
if (!selectedProject.client_id) {
  return setError("El proyecto seleccionado no tiene un cliente vinculado.");
}
    if (!form.titulo.trim()) return setError("Introduce un título para el presupuesto.");
    if (form.titulo.trim().length > 300) return setError("El título no puede superar 300 caracteres.");
    if (!Number.isFinite(iva) || iva < 0 || iva > 100) return setError("El porcentaje de IVA debe estar entre 0 y 100.");
    const irpf = Number(form.irpf_porcentaje || 0);
    if (form.irpf_aplicado && (!Number.isFinite(irpf) || irpf <= 0 || irpf > 100)) return setError("El porcentaje de IRPF debe ser mayor que 0 y menor o igual que 100.");
    if (!form.irpf_aplicado && irpf !== 0) return setError("Si el IRPF no se aplica, el porcentaje debe ser 0.");
    if (!services.length) return setError("Añade al menos un servicio al presupuesto.");
    if (services.some((service) => !service.descripcion.trim())) {
      return setError("Todos los servicios deben tener una descripción.");
    }

    try {
      setSaving(true);

/*
       * La escritura de quotations se realiza exclusivamente mediante
       * la RPC endurecida de la migración 045.
       *
       * No enviamos user_id, client_id, numero_presupuesto ni importes
       * calculados por el navegador: la RPC los determina/valida en BD.
       */
      const { data, error: insertError } = await supabase.rpc(
        "create_quotation_by_worker",
        {
          p_company_id: form.company_id,
          p_project_id: selectedProject.id,
          p_titulo: form.titulo.trim(),
          p_descripcion_detallada:
            form.descripcion_detallada.trim() || null,
          p_servicios_incluidos: services,
          p_iva_porcentaje: iva,
          p_irpf_aplicado: Boolean(form.irpf_aplicado),
          p_irpf_porcentaje: form.irpf_aplicado
            ? Number(form.irpf_porcentaje || 0)
            : 0,
          p_estado: form.estado,
          p_fecha_emision: form.fecha_emision
            ? toIsoDate(form.fecha_emision)
            : new Date().toISOString(),
          p_fecha_validez: form.fecha_validez
            ? toIsoDate(form.fecha_validez)
            : null,
          p_notas: form.notas.trim() || null,
        },
      );

      if (insertError) {
        throw insertError;
      }

      const rpcRow = Array.isArray(data) ? data[0] : data;

      if (!rpcRow?.id) {
        throw new Error(
          "La base de datos no devolvió el presupuesto creado.",
        );
      }

      const { data: createdData, error: createdLoadError } = await supabase
        .from("quotations")
        .select("*")
        .eq("id", rpcRow.id)
        .maybeSingle();

      if (createdLoadError) {
        throw createdLoadError;
      }

      if (!createdData) {
        throw new Error(
          "El presupuesto se creó, pero no se pudo recuperar el registro.",
        );
      }

      const created = createdData as Quotation;

      /*
       * El PDF es una operación independiente. Si Storage falla, no se
       * vuelve a intentar crear la quotation ni se pierde la creación.
       */
      if (selectedPdf) {
        try {
          await uploadPdfForQuotation(created, selectedPdf);
        } catch (pdfError: any) {
          console.error(
            "[EmployeeQuotations] PDF upload after create error:",
            pdfError,
          );

          toast.warning(
            "El presupuesto se creó correctamente, pero no se pudo adjuntar el PDF.",
          );
        }
      }

      toast.success(
        `Presupuesto ${created.numero_presupuesto} creado correctamente.`,
      );
      onCreated(created.id);
    } catch (err: any) {
      console.error("[EmployeeQuotations] Create error:", err);
      setError(err?.message || "No se pudo crear el presupuesto.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageShell title="Presupuestos" subtitle="Preparando nuevo presupuesto..." onOpenMenu={onOpenMenu}>
      <PageLoading text="Preparando nuevo presupuesto..." />
    </PageShell>;
  }

  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <TopPageHeader eyebrow="Presupuestos" subtitle="Nuevo presupuesto" onOpenMenu={onOpenMenu} />

        <div className="space-y-6">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-800">
            <ArrowLeft className="h-4 w-4" />
            Volver a presupuestos
          </button>

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-[#64748B]">
              <FileText className="h-4 w-4 text-[#1E3A8A]" />
              <span>Operaciones</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>Presupuestos</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Crear presupuesto</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">Completa los datos comerciales de la propuesta. El número de presupuesto lo asigna automáticamente el sistema.</p>
          </div>

          {error && <ErrorBox message={error} />}

          <QuotationEditor
            form={form}
            setForm={setForm}
            companies={companies}
            projects={availableProjects}
            subtotal={subtotal}
            ivaAmount={ivaAmount}
            total={total}
            saving={saving}
            selectedPdf={selectedPdf}
            setSelectedPdf={setSelectedPdf}
            creationMode
            onCancel={onBack}
            onSave={save}
          />
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   DETALLE
   ========================================================================== */

/* ============================================================================
   DETALLE
   ========================================================================== */

function QuotationDetail({
  quotationId,
  basePath,
  onBack,
  onOpenMenu,
}: {
  quotationId: string;
  basePath: string;
  onBack: () => void;
  onOpenMenu: () => void;
}) {
  const { user } = useAuth();

  const [quotation, setQuotation] =
    useState<Quotation | null>(null);

  const [companies, setCompanies] =
    useState<Company[]>([]);

  const [projects, setProjects] =
    useState<Project[]>([]);

  const [profiles, setProfiles] =
  useState<Profile[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [editing, setEditing] =
    useState(false);

  const [form, setForm] =
    useState<QuotationForm | null>(
      null
    );

  const [selectedPdf, setSelectedPdf] =
    useState<File | null>(null);

  const [uploadingPdf, setUploadingPdf] =
    useState(false);

  const fileInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const loadQuotation =
    useCallback(
      async (silent = false) => {
        if (!user) {
          setLoading(false);
          return;
        }

        try {
          if (silent) {
            setRefreshing(true);
          } else {
            setLoading(true);
          }

          setError(null);

          const [
            quotationResult,
            companyResult,
            projectResult,
            profileResult,
          ] = await Promise.all([
            supabase
              .from("quotations")
              .select("*")
              .eq(
                "id",
                quotationId
              )
              .maybeSingle(),

           supabase
  .from("companies")
  .select(
  "id, company_name, iva_recomendado_aplicado, iva_recomendado_porcentaje, iva_aprobado_aplicado, iva_aprobado_porcentaje, iva_aprobado_at"
)
              .order(
                "company_name",
                {
                  ascending: true,
                }
              ),

            supabase
              .from("projects")
              .select(
                "id, nombre, company_id, client_id, user_id, estado"
              )
              .order(
                "nombre",
                {
                  ascending: true,
                }
              ),

           supabase
  .from("profiles")
  .select(
    "id, nombre, email, company_id"
  )
  .order(
    "nombre",
    {
      ascending: true,
    }
  ),
          ]);

          if (
            quotationResult.error
          ) {
            throw quotationResult.error;
          }

          if (
            !quotationResult.data
          ) {
            throw new Error(
              "Presupuesto no encontrado o no disponible."
            );
          }

          const current =
            quotationResult.data as Quotation;

          setQuotation(
            current
          );

          setForm(
            toForm(current)
          );

          setCompanies(
            companyResult.error
              ? []
              : (companyResult.data ||
                  []) as Company[]
          );

          setProjects(
            projectResult.error
              ? []
              : (projectResult.data ||
                  []) as Project[]
          );

          setProfiles(
  profileResult.error
    ? []
    : (profileResult.data ||
        []) as Profile[]
);
        } catch (err: any) {
          console.error(
            "[EmployeeQuotations] Detail load error:",
            err
          );

          setError(
            err?.message ||
              "No se pudo cargar el presupuesto."
          );
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      [
        user,
        quotationId,
      ]
    );

  useEffect(() => {
    loadQuotation();
  }, [loadQuotation]);

  const companyName =
    quotation
      ? companies.find(
          (company) =>
            company.id ===
            quotation.company_id
        )?.company_name ||
        "Sin empresa"
      : "Sin empresa";

  const project =
    quotation
      ? projects.find(
          (item) =>
            item.id ===
            quotation.project_id
        ) || null
      : null;

  const client =
  quotation
    ? profiles.find(
        (profile) =>
          String(profile.id) ===
          String(quotation.user_id)
      ) || null
    : null;

  const currentForm =
    form ||
    emptyQuotationForm();

  const services =
    cleanServices(
      currentForm.servicios_incluidos
    );

  const subtotal =
    calculateSubtotal(
      services
    );

  const iva = Number(currentForm.iva_porcentaje || 0);
  const fiscal = calculateQuotationFiscalAmounts(subtotal, iva, currentForm.irpf_aplicado, Number(currentForm.irpf_porcentaje || 0));
  const ivaAmount = fiscal.ivaImporte;
  const total = fiscal.total;

  const beginEdit = () => {
    if (!quotation) {
      return;
    }

    setForm(
      toForm(quotation)
    );

    setSelectedPdf(null);
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    if (!quotation) {
      return;
    }

    setForm(
      toForm(quotation)
    );

    setSelectedPdf(null);
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    if (!quotation || !form) {
      return;
    }

    try {
      await assertActiveWorker();
    } catch (err: any) {
      console.error("[EmployeeQuotations] Worker authorization error:", err);
      setError(
        err?.message ||
          "La sesión actual no corresponde a un trabajador activo de Modira."
      );
      return;
    }

    setError(null);

    if (!form.company_id) {
      setError(
        "Selecciona una empresa."
      );
      return;
    }

    if (
      form.project_id
    ) {
      const selectedProject =
        projects.find(
          (item) =>
            item.id ===
            form.project_id
        );

      if (!selectedProject) {
        setError(
          "El proyecto seleccionado no existe."
        );
        return;
      }

      if (
        String(
          selectedProject.company_id ||
            ""
        ) !==
        String(
          form.company_id
        )
      ) {
        setError(
          "El proyecto no pertenece a la empresa seleccionada."
        );
        return;
      }
    }

    if (!form.titulo.trim()) {
      setError(
        "Introduce un título para el presupuesto."
      );
      return;
    }

    const ivaValue =
      Number(
        form.iva_porcentaje || 0
      );

    if (
      !Number.isFinite(
        ivaValue
      ) ||
      ivaValue < 0 ||
      ivaValue > 100
    ) {
      setError(
        "El porcentaje de IVA debe estar entre 0 y 100."
      );
      return;
    }

    const irpfValue = Number(form.irpf_porcentaje || 0);

    if (
      form.irpf_aplicado &&
      (!Number.isFinite(irpfValue) || irpfValue <= 0 || irpfValue > 100)
    ) {
      setError(
        "El porcentaje de IRPF debe ser mayor que 0 y menor o igual que 100."
      );
      return;
    }

    if (!form.irpf_aplicado && irpfValue !== 0) {
      setError("Si el IRPF no se aplica, el porcentaje debe ser 0.");
      return;
    }

    const clean =
      cleanServices(
        form.servicios_incluidos
      );

    if (
      clean.some(
        (service) =>
          !service.descripcion.trim()
      )
    ) {
      setError(
        "Todos los servicios deben tener una descripción."
      );
      return;
    }

    const selectedProject =
      form.project_id
        ? projects.find(
            (item) =>
              item.id ===
              form.project_id
          ) || null
        : null;

    try {
      setSaving(true);

      const {
        data,
        error: updateError,
      } = await supabase.rpc(
        "update_quotation_by_worker",
        {
          p_quotation_id: quotation.id,
          p_project_id: form.project_id,
          p_titulo: form.titulo.trim(),
          p_descripcion_detallada:
            form.descripcion_detallada.trim() || null,
          p_servicios_incluidos: clean,
          p_iva_porcentaje: ivaValue,
          p_irpf_aplicado: Boolean(form.irpf_aplicado),
          p_irpf_porcentaje: form.irpf_aplicado
            ? irpfValue
            : 0,
          p_estado: form.estado,
          p_fecha_emision: form.fecha_emision
            ? toIsoDate(form.fecha_emision)
            : quotation.fecha_emision,
          p_fecha_validez: form.fecha_validez
            ? toIsoDate(form.fecha_validez)
            : null,
          p_notas: form.notas.trim() || null,
        },
      );

      if (updateError) {
        throw updateError;
      }

      const rpcRow = Array.isArray(data) ? data[0] : data;

      if (!rpcRow?.id) {
        throw new Error(
          "La base de datos no devolvió el presupuesto actualizado.",
        );
      }

      const saved = rpcRow as Quotation;

      if (selectedPdf) {
        await uploadPdfForQuotation(
          saved,
          selectedPdf
        );
      }

      setQuotation(
        saved
      );

      setForm(
        toForm(saved)
      );

      setSelectedPdf(null);
      setEditing(false);

      toast.success(
        "Presupuesto actualizado correctamente."
      );

      await loadQuotation(
        true
      );
    } catch (err: any) {
      console.error(
        "[EmployeeQuotations] Save error:",
        err
      );

      setError(
        err?.message ||
          "No se pudo guardar el presupuesto."
      );
    } finally {
      setSaving(false);
    }
  };

  const changeStatus =
    async (
      status: QuotationStatus
    ) => {
      if (!quotation) {
        return;
      }

      if (
        quotation.estado !==
          "Pendiente" &&
        status !==
          quotation.estado
      ) {
        toast.error(
          "Un presupuesto aceptado o rechazado no puede cambiarse a otro estado mediante la respuesta."
        );
        return;
      }

      try {
        await assertActiveWorker();
        setSaving(true);

        /*
         * respond_to_quotation()
         * es la función definida por las migraciones
         * para la transición Pendiente -> Aceptado/Rechazado.
         */
        const {
          data,
          error: rpcError,
        } = await supabase.rpc(
          "respond_to_quotation",
          {
            p_estado:
              status,
            p_quotation_id:
              quotation.id,
          }
        );

        if (rpcError) {
          throw rpcError;
        }

        const updated =
          Array.isArray(data)
            ? data[0]
            : data;

        if (updated) {
          setQuotation(
            updated as Quotation
          );

          setForm(
            toForm(
              updated as Quotation
            )
          );
        } else {
          await loadQuotation(
            true
          );
        }

        toast.success(
          status ===
            "Aceptado"
            ? "Presupuesto marcado como aceptado."
            : "Presupuesto marcado como rechazado."
        );
      } catch (err: any) {
        console.error(
          "[EmployeeQuotations] Status error:",
          err
        );

        toast.error(
          err?.message ||
            "No se pudo cambiar el estado."
        );
      } finally {
        setSaving(false);
      }
    };

  const deleteQuotation =
    async () => {
      if (!quotation) {
        return;
      }

      const confirmed =
        window.confirm(
          `¿Seguro que quieres eliminar el presupuesto ${quotation.numero_presupuesto}?`
        );

      if (!confirmed) {
        return;
      }

      try {
        await assertActiveWorker();
        setSaving(true);

        /*
         * Primero intentamos eliminar el PDF físico.
         *
         * Si falla, no bloqueamos el borrado de la fila,
         * porque el PDF no es una dependencia FK de quotations.
         */
        if (
          quotation.document_path
        ) {
          const {
            error:
              storageError,
          } =
            await supabase.storage
              .from(
                "quotations"
              )
              .remove([
                quotation.document_path,
              ]);

          if (
            storageError
          ) {
            console.warn(
              "[EmployeeQuotations] PDF delete warning:",
              storageError
            );
          }
        }

        /*
         * 045 revocó DELETE directo sobre quotations.
         * La eliminación se realiza mediante la RPC segura de worker.
         */
        const {
          data: deletedData,
          error: deleteError,
        } = await supabase.rpc(
          "delete_quotation_by_worker",
          {
            p_quotation_id: quotation.id,
          },
        );

        if (deleteError) {
          throw deleteError;
        }

        const deletedRow = Array.isArray(deletedData)
          ? deletedData[0]
          : deletedData;

        if (!deletedRow?.id) {
          throw new Error(
            "La base de datos no confirmó la eliminación del presupuesto.",
          );
        }

        toast.success(
          "Presupuesto eliminado correctamente."
        );

        onBack();
      } catch (err: any) {
        console.error(
          "[EmployeeQuotations] Delete error:",
          err
        );

        setError(
          err?.message ||
            "No se pudo eliminar el presupuesto."
        );
      } finally {
        setSaving(false);
      }
    };

  

  const uploadOnlyPdf =
    async (
      file: File
    ) => {
      if (!quotation) {
        return;
      }

      try {
        setUploadingPdf(true);

        await uploadPdfForQuotation(
          quotation,
          file
        );

        setSelectedPdf(
          null
        );

        await loadQuotation(
          true
        );

        toast.success(
          "PDF del presupuesto sustituido correctamente."
        );
      } catch (err: any) {
        console.error(
          "[EmployeeQuotations] PDF upload error:",
          err
        );

        toast.error(
          err?.message ||
            "No se pudo adjuntar el PDF."
        );
      } finally {
        setUploadingPdf(false);
        if (
          fileInputRef.current
        ) {
          fileInputRef.current.value =
            "";
        }
      }
    };

  const openPdf =
    async (
      download = false
    ) => {
      if (
        !quotation?.document_path
      ) {
        toast.error(
          "Este presupuesto todavía no tiene un PDF adjunto."
        );
        return;
      }

      try {
        await assertActiveWorker();

        const {
          data,
          error:
            signedUrlError,
        } =
          await supabase.storage
            .from(
              "quotations"
            )
            .createSignedUrl(
              quotation.document_path,
              300,
              download
                ? {
                    download:
                      `${quotation.numero_presupuesto}.pdf`,
                  }
                : undefined
            );

        if (
          signedUrlError
        ) {
          throw signedUrlError;
        }

        if (
          !data?.signedUrl
        ) {
          throw new Error(
            "No se pudo generar el enlace seguro del PDF."
          );
        }

        if (download) {
          const anchor =
            document.createElement(
              "a"
            );

          anchor.href =
            data.signedUrl;

          anchor.download =
            `${quotation.numero_presupuesto}.pdf`;

          anchor.target =
            "_blank";

          anchor.rel =
            "noopener noreferrer";

          document.body.appendChild(
            anchor
          );

          anchor.click();

          anchor.remove();
        } else {
          window.open(
            data.signedUrl,
            "_blank",
            "noopener,noreferrer"
          );
        }
      } catch (err: any) {
        console.error(
          "[EmployeeQuotations] PDF open error:",
          err
        );

        toast.error(
          err?.message ||
            "No se pudo abrir el PDF."
        );
      }
    };

  if (loading) {
    return (
      <PageShell
        title="Presupuestos"
        subtitle="Cargando presupuesto..."
        onOpenMenu={
          onOpenMenu
        }
      >
        <PageLoading
          text="Cargando presupuesto..."
        />
      </PageShell>
    );
  }

  if (
    !quotation ||
    error
  ) {
    return (
      <div className="min-h-screen bg-white text-[#172033]">
        <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
          <TopPageHeader
            eyebrow="Presupuestos"
            subtitle="Ficha del presupuesto"
            onOpenMenu={
              onOpenMenu
            }
          />

          <Button
            variant="ghost"
            onClick={onBack}
            className="-ml-2 text-slate-600"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a presupuestos
          </Button>

          <ErrorBox
            message={
              error ||
              "Presupuesto no encontrado."
            }
          />
        </div>
      </div>
    );
  }

  const expired = quotation.estado === "Pendiente" && isExpired(quotation.fecha_validez);

  const clientName = client?.nombre || "Sin cliente";
  const currency = "EUR";

  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <TopPageHeader eyebrow="Presupuestos" subtitle="Ficha del presupuesto" onOpenMenu={onOpenMenu} />

        <div className="space-y-6">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-800">
            <ArrowLeft className="h-4 w-4" />
            Volver a presupuestos
          </button>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <QuotationStatusBadge status={quotation.estado} />
                {quotation.document_path ? (
                  <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                    <FileText className="mr-1 h-3.5 w-3.5" /> PDF adjunto
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-gray-200 bg-white text-gray-500">Sin PDF</Badge>
                )}
                {expired && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">Vencido</Badge>}
              </div>
              <p className="text-sm font-semibold text-[#1E3A8A]">{quotation.numero_presupuesto}</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">{quotation.titulo || "Presupuesto"}</h1>
              <p className="mt-1 max-w-3xl text-sm text-gray-500">{companyName} · {project?.nombre || "Sin proyecto"}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {quotation.document_path && (
                <>
                  <button type="button" onClick={() => openPdf(false)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                    <ExternalLink className="h-4 w-4" /> Ver PDF
                  </button>
                  <button type="button" onClick={() => openPdf(true)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                    <Download className="h-4 w-4" /> Descargar
                  </button>
                </>
              )}
              <button type="button" onClick={() => loadQuotation(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60">
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Actualizar
              </button>
              {!editing && (
                <button type="button" onClick={beginEdit} className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#162D6B]">
                  <Pencil className="h-4 w-4" /> Editar
                </button>
              )}
            </div>
          </div>

          {error && <ErrorBox message={error} />}

          {editing ? (
            <QuotationEditor
              form={form || emptyQuotationForm()}
              setForm={setForm as Dispatch<SetStateAction<QuotationForm>>}
              companies={companies}
              projects={projects}
              subtotal={subtotal}
              ivaAmount={ivaAmount}
              total={total}
              saving={saving || uploadingPdf}
              selectedPdf={selectedPdf}
              setSelectedPdf={setSelectedPdf}
              creationMode={false}
              onCancel={cancelEdit}
              onSave={save}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <QuotationMetricCard icon={<Calculator className="h-4 w-4" />} label="Base imponible" value={formatCurrency(quotation.precio_base)} />
                <QuotationMetricCard icon={<CircleDollarSign className="h-4 w-4" />} label="IVA" value={formatCurrency(Number(quotation.precio_total || 0) - Number(quotation.precio_base || 0))} helper={`${Number(quotation.iva_porcentaje || 0).toFixed(2)}%`} />
                <QuotationMetricCard icon={<ReceiptText className="h-4 w-4" />} label="Total bruto" value={formatCurrency(quotation.precio_total)} />
                <QuotationMetricCard icon={<ShieldCheck className="h-4 w-4" />} label="IRPF" value={quotation.irpf_aplicado ? formatCurrency(quotation.irpf_importe) : "No aplicado"} helper={quotation.irpf_aplicado ? `${Number(quotation.irpf_porcentaje || 0).toFixed(2)}%` : undefined} />
                <QuotationMetricCard icon={<CreditCard className="h-4 w-4" />} label="A pagar" value={formatCurrency(Math.max(Number(quotation.precio_total || 0) - Number(quotation.irpf_importe || 0), 0))} emphasized />
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-6">
                  <QuotationVisualSection title="Información del presupuesto" icon={<FileText className="h-4 w-4" />}>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <QuotationInfoBlock icon={<FileText className="h-4 w-4" />} label="Número de presupuesto" value={quotation.numero_presupuesto} />
                      <QuotationInfoBlock icon={<Building2 className="h-4 w-4" />} label="Empresa" value={companyName} />
                      <QuotationInfoBlock icon={<FolderKanban className="h-4 w-4" />} label="Proyecto" value={project?.nombre || "Sin proyecto"} />
                      <QuotationInfoBlock icon={<User className="h-4 w-4" />} label="Cliente" value={clientName} secondary={client?.email} />
                      <QuotationInfoBlock icon={<CalendarDays className="h-4 w-4" />} label="Fecha de emisión" value={formatDate(quotation.fecha_emision)} />
                      <QuotationInfoBlock icon={<CalendarDays className="h-4 w-4" />} label="Fecha de validez" value={formatDate(quotation.fecha_validez)} />
                      <QuotationInfoBlock icon={<Check className="h-4 w-4" />} label="Estado" value={<QuotationStatusBadge status={quotation.estado} />} />
                    </div>
                  </QuotationVisualSection>

                  <QuotationVisualSection title="Concepto y servicios" icon={<FileText className="h-4 w-4" />}>
                    {quotation.descripcion_detallada && (
                      <div className="mb-5 rounded-lg bg-gray-50 p-4">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Descripción</p>
                        <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{quotation.descripcion_detallada}</p>
                      </div>
                    )}
                    <div className="overflow-hidden rounded-lg border border-gray-200">
                      <div className="grid grid-cols-[minmax(0,1fr)_90px_120px_130px] bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <span>Concepto</span><span className="text-right">Cantidad</span><span className="text-right">Precio</span><span className="text-right">Importe</span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {cleanServices(quotation.servicios_incluidos || []).map((service, index) => (
                          <div key={`${service.descripcion}-${index}`} className="grid grid-cols-[minmax(0,1fr)_90px_120px_130px] items-center px-4 py-3 text-sm">
                            <span className="min-w-0 text-gray-800">{service.descripcion || "Servicio"}</span>
                            <span className="text-right text-gray-600">{Number(service.cantidad || 0)}</span>
                            <span className="text-right text-gray-600">{formatCurrency(service.precio)}</span>
                            <span className="text-right font-semibold text-gray-900">{formatCurrency(Number(service.cantidad || 0) * Number(service.precio || 0))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </QuotationVisualSection>

                  {quotation.notas && <QuotationVisualSection title="Notas" icon={<FileText className="h-4 w-4" />}><p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{quotation.notas}</p></QuotationVisualSection>}

                  <QuotationVisualSection title="Resumen económico" icon={<Calculator className="h-4 w-4" />}>
                    <div className="space-y-3 text-sm">
                      <QuotationTotalRow label="Base imponible" value={formatCurrency(quotation.precio_base)} />
                      <QuotationTotalRow label={`IVA (${Number(quotation.iva_porcentaje || 0).toFixed(2)}%)`} value={formatCurrency(Number(quotation.precio_total || 0) - Number(quotation.precio_base || 0))} />
                      <QuotationTotalRow label="Total bruto" value={formatCurrency(quotation.precio_total)} strong />
                      <QuotationTotalRow label={quotation.irpf_aplicado ? `IRPF (${Number(quotation.irpf_porcentaje || 0).toFixed(2)}%)` : "IRPF"} value={quotation.irpf_aplicado ? `− ${formatCurrency(quotation.irpf_importe)}` : "No aplicado"} />
                      <div className="my-2 border-t border-gray-200" />
                      <QuotationTotalRow label="Importe a pagar" value={formatCurrency(Math.max(Number(quotation.precio_total || 0) - Number(quotation.irpf_importe || 0), 0))} strong emphasized />
                    </div>
                  </QuotationVisualSection>
                </div>

                <aside className="space-y-6">
                  <div className="border-gray-200 bg-white shadow-none">
                    <div className="border-b border-gray-100 p-4"><p className="text-sm font-semibold text-gray-900">Estado del presupuesto</p><p className="mt-1 text-xs leading-5 text-gray-500">La respuesta del presupuesto respeta las transiciones definidas por la base de datos.</p></div>
                    <div className="space-y-4 p-4">
                      <div className="flex items-center justify-between gap-3"><span className="text-sm text-gray-500">Estado</span><QuotationStatusBadge status={quotation.estado} /></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-sm text-gray-500">A pagar</span><span className="font-semibold text-gray-900">{formatCurrency(Math.max(Number(quotation.precio_total || 0) - Number(quotation.irpf_importe || 0), 0))}</span></div>
{quotation.estado === "Pendiente" && (
  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
        <Check className="h-4 w-4 text-amber-700" />
      </div>

      <div>
        <p className="text-sm font-medium text-amber-900">
          Pendiente de aceptación por el cliente
        </p>
        <p className="mt-1 text-sm text-amber-700">
          Este presupuesto debe ser revisado y aceptado o rechazado por el
          cliente. El trabajador no puede modificar su estado de aceptación.
        </p>
      </div>
    </div>
  </div>
)}                    </div>
                  </div>

                  <div className="border-gray-200 bg-white shadow-none">
                    <div className="border-b border-gray-100 p-4"><p className="text-sm font-semibold text-gray-900">Documento del presupuesto</p><p className="mt-1 text-xs leading-5 text-gray-500">El PDF se guarda en el bucket privado de presupuestos.</p></div>
                    <div className="p-4">
                      {quotation.document_path ? <div className="flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 p-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-green-700"><FileText className="h-4 w-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold text-gray-800">{quotation.numero_presupuesto}.pdf</p><p className="text-xs text-green-700">Documento asociado</p></div></div> : <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center"><Upload className="mx-auto h-5 w-5 text-gray-400" /><p className="mt-2 text-sm font-medium text-gray-700">Sin PDF adjunto</p><p className="mt-1 text-xs text-gray-500">Puedes adjuntarlo desde Editar.</p></div>}
                    </div>
                  </div>

                  <div className="border-red-200 bg-white shadow-none"><div className="p-4"><p className="text-sm font-semibold text-red-700">Zona de eliminación</p><p className="mt-1 text-xs leading-5 text-gray-500">La eliminación elimina el presupuesto y, cuando existe, su PDF asociado.</p><button type="button" onClick={deleteQuotation} disabled={saving} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"><Trash2 className="h-4 w-4" />Eliminar presupuesto</button></div></div>

                  <div className="border-blue-100 bg-blue-50/60 shadow-none"><div className="flex gap-3 p-4"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-[#1E3A8A]" /><div><p className="text-sm font-semibold text-[#1E3A8A]">Presupuesto protegido</p><p className="mt-1 text-xs leading-5 text-gray-600">El número de presupuesto se conserva y las relaciones con empresa, proyecto y cliente se mantienen al editar.</p></div></div></div>
                </aside>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   EDITOR
   ========================================================================== */

function QuotationEditor({
  form,
  setForm,
  companies,
  projects,
  subtotal,
  ivaAmount,
  total,
  saving,
  selectedPdf,
  setSelectedPdf,
  creationMode,
  onCancel,
  onSave,
}: {
  form: QuotationForm;
  setForm: Dispatch<SetStateAction<QuotationForm>>;
  companies: Company[];
  projects: Project[];
  subtotal: number;
  ivaAmount: number;
  total: number;
  saving: boolean;
  selectedPdf: File | null;
  setSelectedPdf: (file: File | null) => void;
  creationMode: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const availableProjects = projects.filter((project) => !form.company_id || String(project.company_id || "") === String(form.company_id));
  const base = roundCurrency(Number(subtotal || 0));
  const fiscal = calculateQuotationFiscalAmounts(base, Number(form.iva_porcentaje || 0), form.irpf_aplicado, Number(form.irpf_porcentaje || 0));

  const update = <K extends keyof QuotationForm>(key: K, value: QuotationForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateService = (index: number, field: keyof QuotationService, value: string) => {
    setForm((current) => {
      const next = [...current.servicios_incluidos];
      const service = next[index] || { ...EMPTY_SERVICE };
      next[index] = field === "descripcion"
        ? { ...service, descripcion: value }
        : field === "cantidad"
          ? { ...service, cantidad: Number(value || 0) }
          : { ...service, precio: Number(value || 0) };
      return { ...current, servicios_incluidos: next };
    });
  };

  const addService = () => setForm((current) => ({ ...current, servicios_incluidos: [...current.servicios_incluidos, { ...EMPTY_SERVICE }] }));
  const removeService = (index: number) => setForm((current) => {
    const next = current.servicios_incluidos.filter((_, i) => i !== index);
    return { ...current, servicios_incluidos: next.length ? next : [{ ...EMPTY_SERVICE }] };
  });

  const handlePdf = (file: File | null) => {
    if (!file) return setSelectedPdf(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return toast.error("Solo se permiten archivos PDF.");
    if (file.size <= 0) return toast.error("El archivo está vacío.");
    if (file.size > 10 * 1024 * 1024) return toast.error("El PDF no puede superar los 10 MB.");
    setSelectedPdf(file);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Section title="Datos del presupuesto" icon={<FileText className="h-4 w-4" />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Empresa" required>
            <Select
  value={form.company_id}
  onValueChange={(value) => {
    const selectedCompany = companies.find(
      (company) => String(company.id) === String(value),
    );

    setForm((current) => ({
      ...current,
      company_id: value,
      project_id: "",
      client_id: "",
      iva_porcentaje: selectedCompany?.iva_aprobado_at
        ? selectedCompany.iva_aprobado_aplicado === true
          ? String(selectedCompany.iva_aprobado_porcentaje ?? 21)
          : "0"
        : selectedCompany?.iva_recomendado_aplicado === true &&
            Number.isFinite(
              Number(selectedCompany.iva_recomendado_porcentaje),
            )
          ? String(selectedCompany.iva_recomendado_porcentaje)
          : "21",
    }));
  }}
  disabled={saving}
>
                <SelectTrigger className="h-10 border-gray-200 bg-white"><SelectValue placeholder="Selecciona una empresa" /></SelectTrigger>
                <SelectContent>{companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>

            <Field label="Proyecto" required>
<Select
  value={form.project_id}
  onValueChange={(value) => {
    setForm((current) => ({
      ...current,
      project_id: value,
    }));
  }}
  disabled={saving || !form.company_id}
>                <SelectTrigger className="h-10 border-gray-200 bg-white"><SelectValue placeholder={form.company_id ? "Selecciona un proyecto" : "Selecciona primero una empresa"} /></SelectTrigger>
                <SelectContent>{availableProjects.map((project) => <SelectItem key={project.id} value={project.id}>{project.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </Field>

            <Field label="Número de presupuesto">
              <Input value={creationMode ? "Se generará automáticamente" : form.numero_presupuesto} disabled className="h-10 bg-gray-50 text-gray-500" />
            </Field>

            <Field label="Estado">
              <Select value={form.estado} onValueChange={(value) => update("estado", value as QuotationStatus)} disabled={saving}>
                <SelectTrigger className="h-10 border-gray-200 bg-white"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Pendiente">Pendiente</SelectItem><SelectItem value="Aceptado">Aceptado</SelectItem><SelectItem value="Rechazado">Rechazado</SelectItem></SelectContent>
              </Select>
            </Field>

            {form.project_id && <div className="sm:col-span-2"><div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3.5 py-3 text-xs text-gray-500"><FolderKanban className="h-4 w-4 shrink-0 text-gray-400" /><span>Cliente vinculado al proyecto: <strong className="font-semibold text-gray-700">{getProjectClientLabel(form.project_id, projects)}</strong></span></div></div>}

            <Field label="Título" required className="sm:col-span-2"><Input value={form.titulo} onChange={(event) => update("titulo", event.target.value)} maxLength={300} placeholder="Ej. Automatización del proceso de facturación" disabled={saving} className="h-10" /></Field>
            <Field label="Fecha de emisión"><Input type="date" value={form.fecha_emision} onChange={(event) => update("fecha_emision", event.target.value)} className="h-10" disabled={saving} /></Field>
            <Field label="Fecha de validez"><Input type="date" value={form.fecha_validez} onChange={(event) => update("fecha_validez", event.target.value)} className="h-10" disabled={saving} /></Field>
            <Field label="Descripción detallada" className="sm:col-span-2"><Textarea value={form.descripcion_detallada} onChange={(event) => update("descripcion_detallada", event.target.value)} placeholder="Describe el alcance y condiciones de la propuesta..." rows={4} disabled={saving} /></Field>
          </div>
        </Section>

        <Section title="Servicios incluidos" icon={<ReceiptText className="h-4 w-4" />} action={<button type="button" onClick={addService} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"><Plus className="h-3.5 w-3.5" />Añadir línea</button>}>
          <div className="space-y-3">
            {form.servicios_incluidos.map((service, index) => (
              <div key={index} className="grid gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-[minmax(0,1fr)_100px_130px_auto]">
                <div><label className="mb-1 block text-xs font-medium text-gray-500">Concepto</label><Input value={service.descripcion} onChange={(event) => updateService(index, "descripcion", event.target.value)} placeholder="Servicio o concepto" disabled={saving} /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-500">Cantidad</label><Input type="number" min="0" step="0.01" value={service.cantidad} onChange={(event) => updateService(index, "cantidad", event.target.value)} disabled={saving} /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-500">Precio unitario</label><Input type="number" min="0" step="0.01" value={service.precio} onChange={(event) => updateService(index, "precio", event.target.value)} disabled={saving} /></div>
                <div className="flex items-end"><button type="button" onClick={() => removeService(index)} disabled={saving} className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 sm:w-auto"><Trash2 className="h-3.5 w-3.5" /><span className="sm:hidden">Eliminar</span></button></div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Fiscalidad" icon={<Calculator className="h-4 w-4" />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base imponible"><div className="relative"><Input value={base.toFixed(2)} disabled className="h-10 bg-gray-50 pr-10" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">€</span></div></Field>
<Field label="IVA">
  <div className="space-y-2">
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
        disabled={saving}
      />

      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
        %
      </span>
    </div>

    {form.company_id && (() => {
      const selectedCompany = companies.find(
        (company) =>
          String(company.id) === String(form.company_id)
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
          Puedes modificar el IVA de este presupuesto si la operación
          requiere un tratamiento fiscal diferente.
        </>
      ) : hasRecommendation ? (
        <>
          <span className="font-semibold text-[#1E3A8A]">
            IVA recomendado para esta empresa:{" "}
            {Number(selectedCompany.iva_recomendado_porcentaje)} %.
          </span>{" "}
          No existe un tratamiento aprobado por solicitud para esta empresa.
          Puedes modificar el IVA de este presupuesto si la operación
          requiere un tratamiento fiscal diferente.
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
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={form.irpf_aplicado} onChange={(event) => { const applied = event.target.checked; update("irpf_aplicado", applied); if (!applied) update("irpf_porcentaje", "0"); }} disabled={saving} className="mt-1 h-4 w-4 rounded border-gray-300" /><span><span className="block text-sm font-semibold text-gray-800">Aplicar retención de IRPF</span><span className="mt-0.5 block text-xs leading-5 text-gray-500">La retención se calcula sobre la base imponible y reduce el importe efectivamente exigible.</span></span></label>
              {form.irpf_aplicado && <div className="mt-4 max-w-xs"><Field label="Porcentaje de IRPF"><div className="relative"><Input type="number" min="0.01" max="100" step="0.01" value={form.irpf_porcentaje} onChange={(event) => update("irpf_porcentaje", event.target.value)} className="h-10 pr-10" disabled={saving} /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span></div></Field></div>}
            </div>
            <div className="rounded-lg bg-gray-50 p-4 sm:col-span-2"><div className="space-y-2 text-sm"><TotalRow label="Base imponible" value={money(fiscal.subtotal)} /><TotalRow label={`IVA (${fiscal.ivaRate.toFixed(2)}%)`} value={money(fiscal.ivaImporte)} /><TotalRow label="Total bruto" value={money(fiscal.total)} strong />{form.irpf_aplicado && <TotalRow label={`IRPF (${fiscal.irpfRate.toFixed(2)}%)`} value={`− ${money(fiscal.irpfImporte)}`} />}<div className="border-t border-gray-200 pt-2"><TotalRow label="Importe a pagar" value={money(fiscal.importeAPagar)} strong emphasized /></div></div></div>
          </div>
        </Section>

        <Section title="Notas" icon={<FileText className="h-4 w-4" />}><Textarea value={form.notas} onChange={(event) => update("notas", event.target.value)} placeholder="Notas internas o información adicional del presupuesto..." rows={4} disabled={saving} /></Section>

        <Section title="Documento PDF" icon={<Upload className="h-4 w-4" />}>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-5 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50/30"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#1E3A8A] shadow-none"><Upload className="h-4 w-4" /></div><p className="mt-3 text-sm font-semibold text-gray-800">{selectedPdf ? selectedPdf.name : "Adjuntar presupuesto en PDF"}</p><p className="mt-1 text-xs text-gray-500">Solo PDF · máximo 10 MB</p><input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => handlePdf(event.target.files?.[0] || null)} disabled={saving} /></label>
          {selectedPdf && <button type="button" onClick={() => setSelectedPdf(null)} disabled={saving} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"><X className="h-3.5 w-3.5" />Quitar archivo seleccionado</button>}
        </Section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={onCancel} disabled={saving} className="border-gray-200 bg-white text-gray-700">Cancelar</Button><Button onClick={onSave} disabled={saving} className="bg-[#1E3A8A] text-white hover:bg-[#162D6B]">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}{creationMode ? "Crear presupuesto" : "Guardar cambios"}</Button></div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="border-gray-200 bg-white shadow-none"><div className="border-b border-gray-100 p-4"><p className="text-sm font-semibold text-gray-900">Vista previa del importe</p><p className="mt-1 text-xs leading-5 text-gray-500">La vista previa replica la secuencia fiscal del presupuesto: IVA sobre la base, IRPF sobre la base y, finalmente, importe a pagar.</p></div><div className="space-y-3 p-4"><TotalRow label="Base imponible" value={money(fiscal.subtotal)} /><TotalRow label={`IVA (${fiscal.ivaRate.toFixed(2)}%)`} value={money(fiscal.ivaImporte)} /><TotalRow label="Total bruto" value={money(fiscal.total)} strong />{form.irpf_aplicado && <TotalRow label={`IRPF (${fiscal.irpfRate.toFixed(2)}%)`} value={`− ${money(fiscal.irpfImporte)}`} />}<div className="border-t border-gray-200 pt-3"><TotalRow label="A pagar" value={money(fiscal.importeAPagar)} strong emphasized /></div></div></div>
        <div className="border-blue-100 bg-blue-50/60 shadow-none"><div className="flex gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1E3A8A]" /><div><p className="text-sm font-semibold text-[#1E3A8A]">Reglas del presupuesto</p><ul className="mt-2 space-y-1.5 text-xs leading-5 text-gray-600"><li>• El número de presupuesto lo genera el sistema.</li><li>• Empresa, proyecto y cliente permanecen relacionados.</li><li>• IVA, IRPF, total bruto y a pagar se recalculan en BD.</li><li>• El PDF utiliza almacenamiento privado.</li></ul></div></div></div>
      </aside>
    </div>
  );
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

function EmptyInvoices({ hasFilters, onCreate }: { hasFilters: boolean; onCreate: () => void }) {
  return (
    <div className="border-y border-gray-200">
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]"><FileText className="h-5 w-5" /></div>
        <h3 className="mt-4 text-base font-semibold text-gray-900">{hasFilters ? "No hay presupuestos que coincidan" : "Todavía no hay presupuestos"}</h3>
        <p className="mt-1 max-w-md text-sm text-gray-500">{hasFilters ? "Prueba a cambiar los filtros o la búsqueda." : "Crea el primer presupuesto para empezar a gestionar tus propuestas."}</p>
        {!hasFilters && <button type="button" onClick={onCreate} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" />Crear presupuesto</button>}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, helper, emphasized }: { icon: ReactNode; label: string; value: ReactNode; helper?: ReactNode; emphasized?: boolean }) {
  return (
    <div className={["border border-slate-200 bg-white p-4", emphasized ? "border-blue-200" : ""].join(" ")}>
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

function InfoMini({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div>
      <p className="text-gray-500">{label}</p>
      <p className={`mt-0.5 truncate ${strong ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>{value}</p>
    </div>
  );
}

function Section({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-gray-200 pb-6">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2"><span className="text-[#1E3A8A]">{icon}</span><h2 className="text-sm font-semibold text-gray-900">{title}</h2></div>
        {action}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}

function Field({ label, required, children, className = "" }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return <div className={className}><label className="mb-1.5 block text-xs font-semibold text-gray-600">{label}{required && <span className="ml-1 text-red-500">*</span>}</label>{children}</div>;
}

function TotalRow({ label, value, strong, emphasized }: { label: string; value: ReactNode; strong?: boolean; emphasized?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${emphasized ? "text-[#1E3A8A]" : ""}`}>
      <span className={strong ? "font-semibold" : "text-gray-600"}>{label}</span>
      <span className={strong ? `font-bold ${emphasized ? "text-lg" : "text-gray-900"}` : "font-medium text-gray-800"}>{value}</span>
    </div>
  );
}

function QuotationVisualSection({ title, icon, action, children }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <section className="border-b border-gray-200 pb-6"><div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3"><div className="flex items-center gap-2"><span className="text-[#1E3A8A]">{icon}</span><h2 className="text-sm font-semibold text-gray-900">{title}</h2></div>{action}</div><div className="pt-5">{children}</div></section>;
}

function QuotationField({ label, required, children, className = "" }: { label: string; required?: boolean; children: ReactNode; className?: string }) {
  return <div className={className}><label className="mb-1.5 block text-xs font-semibold text-gray-600">{label}{required && <span className="ml-1 text-red-500">*</span>}</label>{children}</div>;
}

function QuotationInfoBlock({ icon, label, value, secondary }: { icon?: ReactNode; label: string; value: ReactNode; secondary?: ReactNode }) {
  return <div className="flex gap-3"><div className="mt-0.5 text-gray-400">{icon}</div><div className="min-w-0"><p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-gray-800">{value}</p>{secondary && <p className="mt-0.5 break-all text-xs text-gray-500">{secondary}</p>}</div></div>;
}

function QuotationTotalRow({ label, value, strong, emphasized }: { label: string; value: ReactNode; strong?: boolean; emphasized?: boolean }) {
  return <div className={`flex items-center justify-between gap-4 ${emphasized ? "text-[#1E3A8A]" : ""}`}><span className={strong ? "font-semibold" : "text-gray-600"}>{label}</span><span className={strong ? `font-bold ${emphasized ? "text-lg" : "text-gray-900"}` : "font-medium text-gray-800"}>{value}</span></div>;
}

function QuotationMetricCard({ icon, label, value, helper, emphasized }: { icon: ReactNode; label: string; value: ReactNode; helper?: ReactNode; emphasized?: boolean }) {
  return <div className={`border border-slate-200 bg-white p-4 ${emphasized ? "border-blue-200" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-2 truncate text-2xl font-bold tracking-tight text-slate-800">{value}</p>{helper && <p className="mt-1 text-xs text-slate-400">{helper}</p>}</div><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">{icon}</div></div></div>;
}

/* ============================================================================
   HELPERS DE UI
   ========================================================================== */

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
        onClick={
          onOpenMenu
        }
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#5F6B7C] transition-colors hover:bg-white hover:text-[#172033]"
        aria-label="Abrir menú de navegación"
      >
        <Menu
          className="h-5 w-5"
          strokeWidth={1.7}
        />
      </button>

      <div className="hidden flex-1 sm:block">
        <p className="text-sm font-semibold text-[#263044]">
          {eyebrow}
        </p>

        <p className="text-xs text-[#939CAA]">
          {subtitle}
        </p>
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
        <TopPageHeader
          eyebrow={title}
          subtitle={subtitle}
          onOpenMenu={
            onOpenMenu
          }
        />

        {children}
      </div>
    </div>
  );
}

function PageLoading({
  text,
}: {
  text: string;
}) {
  return (
    <Card className="border border-slate-200 bg-white shadow-none">
      <div className="flex min-h-[420px] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]" />

        <p className="mt-4 text-sm font-medium text-slate-600">
          {text}
        </p>
      </div>
    </Card>
  );
}

function ErrorBox({
  message,
}: {
  message: string;
}) {
  return (
    <Card className="border border-red-200 bg-red-50 shadow-none">
      <div className="flex items-start gap-3 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

        <div>
          <p className="font-semibold text-red-800">
            Se ha producido un error
          </p>

          <p className="mt-1 text-sm text-red-700">
            {message}
          </p>
        </div>
      </div>
    </Card>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
  className?: string;
}) {
  return (
    <Card
      className={[
        "border border-slate-200 bg-white p-4 shadow-none",
        className,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </p>

          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-800">
            {value}
          </p>

          <p className="mt-1 text-xs text-slate-400">
            {detail}
          </p>
        </div>

        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">
          {icon}
        </div>
      </div>
    </Card>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
}) {
  return (
    <Select
      value={value}
      onValueChange={onChange}
    >
      <SelectTrigger className="h-10 border-slate-200 bg-white">
        <SelectValue />
      </SelectTrigger>

      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TableHead({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={[
        "px-4 py-4 text-left text-xs font-semibold uppercase",
        "tracking-wider text-slate-500 first:px-6",
        className,
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function QuotationIcon({
  large = false,
}: {
  large?: boolean;
}) {
  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]",
        large
          ? "h-12 w-12 rounded-2xl"
          : "h-9 w-9",
      ].join(" ")}
    >
      <FileText
        className={
          large
            ? "h-6 w-6"
            : "h-4 w-4"
        }
      />
    </div>
  );
}

function QuotationStatusBadge({
  status,
}: {
  status: QuotationStatus;
}) {
  const styles: Record<
    QuotationStatus,
    string
  > = {
    Pendiente:
      "border-amber-200 bg-amber-50 text-amber-700",

    Aceptado:
      "border-emerald-200 bg-emerald-50 text-emerald-700",

    Rechazado:
      "border-red-200 bg-red-50 text-red-700",
  };

  const dotStyles: Record<
    QuotationStatus,
    string
  > = {
    Pendiente:
      "bg-amber-500",

    Aceptado:
      "bg-emerald-500",

    Rechazado:
      "bg-red-500",
  };

  return (
    <Badge
      variant="outline"
      className={
        styles[status]
      }
    >
      <span
        className={[
          "mr-1.5 h-1.5 w-1.5 rounded-full",
          dotStyles[status],
        ].join(" ")}
      />

      {status}
    </Badge>
  );
}

function MetricBlock({
  icon,
  label,
  value,
  detail,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail?: string;
  danger?: boolean;
}) {
  return (
    <div className="border-t border-slate-100 p-6 lg:border-l lg:border-t-0">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
        {icon}
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p
        className={
          danger
            ? "mt-1 text-lg font-bold text-red-600"
            : "mt-1 text-lg font-bold text-slate-800"
        }
      >
        {value}
      </p>

      {detail && (
        <p className="mt-1 text-xs text-slate-400">
          {detail}
        </p>
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 lg:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">
          {icon}
        </div>

        <div className="min-w-0">
          <h2 className="font-semibold text-slate-800">
            {title}
          </h2>

          {description && (
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {description}
            </p>
          )}
        </div>
      </div>

      {action}
    </div>
  );
}

function InfoField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      {children}
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>

      {children}
    </div>
  );
}

function SummaryLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span
        className={
          strong
            ? "font-semibold text-slate-700"
            : "text-sm text-slate-500"
        }
      >
        {label}
      </span>

      <span
        className={
          strong
            ? "text-lg font-bold text-slate-900"
            : "text-sm font-medium text-slate-700"
        }
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        {icon}
      </div>

      <h3 className="mt-4 font-semibold text-slate-700">
        {title}
      </h3>

      <p className="mt-1 max-w-md text-sm leading-6 text-slate-400">
        {description}
      </p>
    </div>
  );
}

/* ============================================================================
   HELPERS DE DATOS
   ========================================================================== */

function roundCurrency(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function calculateQuotationFiscalAmounts(
  subtotalValue: number,
  ivaPercentage: number,
  irpfApplied: boolean,
  irpfPercentage: number,
) {
  const subtotal = roundCurrency(Math.max(Number(subtotalValue) || 0, 0));
  const ivaRate = roundCurrency(Math.max(Number(ivaPercentage) || 0, 0));
  const ivaImporte = roundCurrency((subtotal * ivaRate) / 100);
  const total = roundCurrency(subtotal + ivaImporte);
  const irpfRate = irpfApplied
    ? roundCurrency(Math.max(Number(irpfPercentage) || 0, 0))
    : 0;
  const irpfImporte = irpfApplied
    ? roundCurrency((subtotal * irpfRate) / 100)
    : 0;
  const importeAPagar = roundCurrency(Math.max(total - irpfImporte, 0));

  return {
    subtotal,
    ivaRate,
    ivaImporte,
    total,
    irpfRate,
    irpfImporte,
    importeAPagar,
  };
}

function emptyQuotationForm(): QuotationForm {
  return {
    company_id: "",
    project_id: "",
    client_id: "",

    /*
     * Se mantiene vacío porque numero_presupuesto
     * lo genera la base de datos.
     */
    numero_presupuesto: "",

    titulo: "",
    descripcion_detallada: "",

    servicios_incluidos: [
      {
        ...EMPTY_SERVICE,
      },
    ],

    iva_porcentaje: "21",
    irpf_aplicado: false,
    irpf_porcentaje: "0",
    estado: "Pendiente",

    fecha_emision:
      getTodayForInput(),

    fecha_validez: "",

    notas: "",
  };
}

function toForm(
  quotation: Quotation
): QuotationForm {
  return {
    company_id:
      quotation.company_id ||
      "",

    project_id:
      quotation.project_id ||
      "",

    client_id:
      quotation.client_id ||
      "",

    numero_presupuesto:
      quotation.numero_presupuesto ||
      "",

    titulo:
      quotation.titulo ||
      "",

    descripcion_detallada:
      quotation.descripcion_detallada ||
      "",

    servicios_incluidos:
      Array.isArray(
        quotation.servicios_incluidos
      )
        ? quotation.servicios_incluidos.map(
            (service) => ({
              descripcion:
                String(
                  service?.descripcion ||
                    ""
                ),

              cantidad:
                Number(
                  service?.cantidad ??
                    1
                ),

              precio:
                Number(
                  service?.precio ??
                    0
                ),
            })
          )
        : [],

    iva_porcentaje:
      String(
        quotation.iva_porcentaje ??
          21
      ),

    irpf_aplicado:
      Boolean(quotation.irpf_aplicado),

    irpf_porcentaje:
      String(quotation.irpf_porcentaje ?? 0),

    estado:
      quotation.estado,

    fecha_emision:
      toInputDate(
        quotation.fecha_emision
      ),

    fecha_validez:
      quotation.fecha_validez
        ? toInputDate(
            quotation.fecha_validez
          )
        : "",

    notas:
      quotation.notas ||
      "",
  };
}

function cleanServices(
  services:
    | QuotationService[]
    | null
    | undefined
): QuotationService[] {
  return (
    services || []
  )
    .map(
      (service) => ({
        descripcion:
          String(
            service?.descripcion ||
              ""
          ).trim(),

        cantidad:
          Math.max(
            0,
            Number(
              service?.cantidad ??
                0
            )
          ),

        precio:
          Math.max(
            0,
            Number(
              service?.precio ??
                0
            )
          ),
      })
    )
    .filter(
      (service) =>
        service.descripcion ||
        service.cantidad > 0 ||
        service.precio > 0
    );
}

function calculateSubtotal(
  services:
    | QuotationService[]
    | null
    | undefined
) {
  return Number(
    (
      cleanServices(
        services
      ).reduce(
        (sum, service) =>
          sum +
          Number(
            service.cantidad || 0
          ) *
            Number(
              service.precio || 0
            ),
        0
      )
    ).toFixed(2)
  );
}

function getProjectClientLabel(projectId: string, projects: Project[]) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return "Sin proyecto";
  return project.client_id ? "Cliente vinculado" : "Sin cliente vinculado";
}

function getQuotationIdFromPath(
  location: string,
  base: string
) {
  const normalized =
    location
      .split("?")[0]
      .replace(
        /\/+$/,
        ""
      );

  const normalizedBase =
    base.replace(
      /\/+$/,
      ""
    );

  if (
    !normalized.startsWith(
      `${normalizedBase}/`
    )
  ) {
    return null;
  }

  const remainder =
    normalized.slice(
      normalizedBase.length +
        1
    );

  if (
    !remainder ||
    remainder === "new" ||
    remainder.includes("/")
  ) {
    return null;
  }

  return remainder;
}

function isNewQuotationRoute(
  location: string,
  base: string
) {
  const normalized =
    location
      .split("?")[0]
      .replace(
        /\/+$/,
        ""
      );

  const normalizedBase =
    base.replace(
      /\/+$/,
      ""
    );

  return (
    normalized ===
    `${normalizedBase}/new`
  );
}

function getTodayForInput() {
  const date =
    new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toInputDate(
  value: string
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toIsoDate(
  value: string
) {
  return new Date(
    `${value}T00:00:00`
  ).toISOString();
}

function isExpired(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return false;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return false;
  }

  return (
    date.getTime() <
    Date.now()
  );
}

function formatDate(
  value:
    | string
    | null
    | undefined
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "es-ES",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  ).format(date);
}

function formatCurrency(
  value:
    | number
    | null
    | undefined
) {
  return new Intl.NumberFormat(
    "es-ES",
    {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }
  ).format(
    Number(
      value || 0
    )
  );
}