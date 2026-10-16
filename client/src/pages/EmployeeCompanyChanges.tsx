import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  FolderKanban,
  Loader2,
  Menu,
  RefreshCw,
  Search,
  Ticket,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";

import { toast } from "sonner";

/* ============================================================================
   TIPOS
   ========================================================================== */

type ChangeStatus = "pending" | "approved" | "rejected" | "cancelled";

interface Company {
  id: string;
  company_name: string | null;
  company_code?: string | null;
  legal_name?: string | null;
  cif_vat?: string | null;
  billing_email?: string | null;
  phone?: string | null;
  website?: string | null;
  country?: string | null;
  timezone?: string | null;
  language?: string | null;
  currency?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface Profile {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono?: string | null;
  company_id: string | null;
  rol?: string | null;
}

interface Worker {
  id: string;
  auth_user_id: string;
  display_name: string | null;
  is_active: boolean;
}

interface CompanyChangeRequest {
  id: string;
  user_id: string;
  current_company_id: string | null;
  requested_company_id: string | null;
  requested_company_name: string | null;
  reason: string | null;
  status: ChangeStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface EmployeeCompanyChangesProps {
  basePath?: string;
  onMenuNavigate?: (id: string) => void;
}

/* ============================================================================
   UTILIDADES
   ========================================================================== */

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateShort(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLocaleLowerCase("es-ES");
}

function statusLabel(status: ChangeStatus) {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "approved":
      return "Aprobada";
    case "rejected":
      return "Rechazada";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
}

function statusClasses(status: ChangeStatus) {
  switch (status) {
    case "pending":
      return "border-[#F3E7C3] bg-[#FFF9E9] text-[#8A6916]";
    case "approved":
      return "border-[#D9EBDD] bg-[#F2FAF3] text-[#2F6B3A]";
    case "rejected":
      return "border-[#F0D8D8] bg-[#FFF5F5] text-[#9A4545]";
    case "cancelled":
      return "border-[#E3E6EB] bg-[#F7F8FA] text-[#667085]";
    default:
      return "border-[#E3E6EB] bg-[#F7F8FA] text-[#667085]";
  }
}

async function assertActiveWorker() {
  const { data, error } = await supabase.rpc("current_user_is_worker");

  if (error) {
    throw error;
  }

  if (data !== true) {
    throw new Error(
      "La sesión actual no corresponde a un trabajador activo de Modira."
    );
  }
}

/* ============================================================================
   MENÚ LATERAL — MISMO FORMATO QUE EMPLOYEEQUOTATIONS
   ========================================================================== */

function EmployeeCompanyChangesNavigation({
  open,
  location,
  employeeRoot,
  companyChangesBase,
  onClose,
  onNavigate,
}: {
  open: boolean;
  location: string;
  employeeRoot: string;
  companyChangesBase: string;
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
    if (id === "companyChanges") {
      return (
        location === companyChangesBase ||
        location.startsWith(`${companyChangesBase}/`)
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
        open ? "translate-x-0" : "-translate-x-full",
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
   COMPONENTE PRINCIPAL
   ========================================================================== */

export default function EmployeeCompanyChanges({
  basePath = "/employee/company-changes",
  onMenuNavigate,
}: EmployeeCompanyChangesProps) {
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const base =
    basePath.replace(/\/+$/, "") || "/employee/company-changes";

  const employeeRoot =
    base.replace(/\/company-changes$/, "") || "/employee";

  const selectedId = useMemo(() => {
    const prefix = `${base}/`;

    if (!location.startsWith(prefix)) {
      return null;
    }

    const value = location.slice(prefix.length).split("/")[0];

    return value || null;
  }, [base, location]);

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
        quotations: `${employeeRoot}/quotations`,
        billing: `${employeeRoot}/billing`,
        payments: `${employeeRoot}/payments`,
        support: `${employeeRoot}/support`,

        ai: `${employeeRoot}/ai`,
        notifications: `${employeeRoot}/notifications`,

        activity: `${employeeRoot}/activity`,
        audits: `${employeeRoot}/audits`,
        companyChanges: base,
        maintenance: `${employeeRoot}/maintenance`,

        automations: `${employeeRoot}/automations`,
        automationRuns: `${employeeRoot}/automationRuns`,
      };

      const target = pathMap[id];

      if (target) {
        setLocation(target);
      }
    },
    [base, employeeRoot, onMenuNavigate, setLocation]
  );

  const navigation = (
    <EmployeeCompanyChangesNavigation
      open={menuOpen}
      location={location}
      employeeRoot={employeeRoot}
      companyChangesBase={base}
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

  return (
    <>
      {navigation}
      {overlay}

      <CompanyChangesPage
        basePath={base}
        selectedId={selectedId}
        onOpenMenu={() => setMenuOpen(true)}
        onOpenRequest={(id) => {
          setLocation(`${base}/${id}`);
        }}
        onBackToList={() => setLocation(base)}
      />
    </>
  );
}

/* ============================================================================
   PÁGINA
   ========================================================================== */

function CompanyChangesPage({
  basePath,
  selectedId,
  onOpenMenu,
  onOpenRequest,
  onBackToList,
}: {
  basePath: string;
  selectedId: string | null;
  onOpenMenu: () => void;
  onOpenRequest: (id: string) => void;
  onBackToList: () => void;
}) {
  const { user } = useAuth();

  const [requests, setRequests] = useState<CompanyChangeRequest[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | ChangeStatus
  >("all");
  const [companyFilter, setCompanyFilter] = useState("all");

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(
    async (silent = false) => {
      if (!user) {
        setLoading(false);
        setRequests([]);
        return;
      }

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        await assertActiveWorker();

        const [
          requestsResult,
          companiesResult,
          profilesResult,
          workersResult,
        ] = await Promise.all([
          supabase
            .from("company_change_requests")
            .select(
              [
                "id",
                "user_id",
                "current_company_id",
                "requested_company_id",
                "requested_company_name",
                "reason",
                "status",
                "reviewed_by",
                "reviewed_at",
                "review_notes",
                "created_at",
                "updated_at",
              ].join(", ")
            )
            .order("created_at", {
              ascending: false,
            }),

          supabase
            .from("companies")
            .select(
              [
                "id",
                "company_name",
                "company_code",
                "legal_name",
                "cif_vat",
                "billing_email",
                "phone",
                "website",
                "country",
                "timezone",
                "language",
                "currency",
                "is_active",
                "created_at",
                "updated_at",
              ].join(", ")
            )
            .order("company_name", {
              ascending: true,
            }),

          supabase
            .from("profiles")
            .select(
              "id, nombre, email, telefono, company_id, rol"
            )
            .order("nombre", {
              ascending: true,
            }),

          supabase
            .from("workers")
            .select(
              "id, auth_user_id, display_name, is_active"
            )
            .order("display_name", {
              ascending: true,
            }),
        ]);

        if (requestsResult.error) {
          throw requestsResult.error;
        }

        if (companiesResult.error) {
          throw companiesResult.error;
        }

        if (profilesResult.error) {
          throw profilesResult.error;
        }

        if (workersResult.error) {
          throw workersResult.error;
        }

        setRequests(
          (requestsResult.data || []) as CompanyChangeRequest[]
        );
        setCompanies(
          (companiesResult.data || []) as Company[]
        );
        setProfiles(
          (profilesResult.data || []) as Profile[]
        );
        setWorkers(
          (workersResult.data || []) as Worker[]
        );
      } catch (error) {
        console.error(
          "[EmployeeCompanyChanges] Error cargando datos:",
          error
        );

        toast.error(
          error instanceof Error
            ? error.message
            : "No se han podido cargar los cambios de empresa."
        );
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

  const companyMap = useMemo(() => {
    const map = new Map<string, Company>();

    companies.forEach((company) => {
      map.set(company.id, company);
    });

    return map;
  }, [companies]);

  const profileMap = useMemo(() => {
    const map = new Map<string, Profile>();

    profiles.forEach((profile) => {
      map.set(profile.id, profile);
    });

    return map;
  }, [profiles]);

  const workerMap = useMemo(() => {
    const map = new Map<string, Worker>();

    workers.forEach((worker) => {
      map.set(worker.id, worker);
    });

    return map;
  }, [workers]);

  const companyOptions = useMemo(() => {
    const ids = new Set<string>();

    requests.forEach((request) => {
      if (request.current_company_id) {
        ids.add(request.current_company_id);
      }

      if (request.requested_company_id) {
        ids.add(request.requested_company_id);
      }
    });

    return companies
      .filter((company) => ids.has(company.id))
      .sort((a, b) =>
        normalize(a.company_name).localeCompare(
          normalize(b.company_name),
          "es"
        )
      );
  }, [companies, requests]);

  const filteredRequests = useMemo(() => {
    const query = normalize(search);

    return requests.filter((request) => {
      const requester = profileMap.get(request.user_id);
      const currentCompany = request.current_company_id
        ? companyMap.get(request.current_company_id)
        : undefined;
      const requestedCompany = request.requested_company_id
        ? companyMap.get(request.requested_company_id)
        : undefined;

      const matchesStatus =
        statusFilter === "all" ||
        request.status === statusFilter;

      const matchesCompany =
        companyFilter === "all" ||
        request.current_company_id === companyFilter ||
        request.requested_company_id === companyFilter;

      const haystack = [
        requester?.nombre,
        requester?.email,
        currentCompany?.company_name,
        requestedCompany?.company_name,
        request.requested_company_name,
        request.reason,
        request.review_notes,
        request.id,
      ]
        .map(normalize)
        .join(" ");

      const matchesSearch =
        !query || haystack.includes(query);

      return (
        matchesStatus &&
        matchesCompany &&
        matchesSearch
      );
    });
  }, [
    companyFilter,
    companyMap,
    profileMap,
    requests,
    search,
    statusFilter,
  ]);

  const stats = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter(
        (request) => request.status === "pending"
      ).length,
      approved: requests.filter(
        (request) => request.status === "approved"
      ).length,
      rejected: requests.filter(
        (request) => request.status === "rejected"
      ).length,
    };
  }, [requests]);

  const selectedRequest = useMemo(() => {
    if (!selectedId) return null;

    return (
      requests.find(
        (request) => request.id === selectedId
      ) || null
    );
  }, [requests, selectedId]);

  const resolveRequest = async (
    request: CompanyChangeRequest,
    action: "approved" | "rejected"
  ) => {
    if (request.status !== "pending") {
      toast.error(
        "La solicitud ya ha sido gestionada."
      );
      return;
    }

    const actionLabel =
      action === "approved"
        ? "aprobar"
        : "rechazar";

    const confirmed = window.confirm(
      `¿Quieres ${actionLabel} esta solicitud de cambio de empresa?`
    );

    if (!confirmed) return;

    setProcessingId(request.id);

    try {
      await assertActiveWorker();

      const { data, error } = await supabase.rpc(
        "resolve_company_change_request",
        {
          p_request_id: request.id,
          p_action: action,
        }
      );

      if (error) {
        throw error;
      }

      if (data !== true) {
        throw new Error(
          "La operación no ha podido completarse."
        );
      }

      toast.success(
        action === "approved"
          ? "Solicitud aprobada correctamente."
          : "Solicitud rechazada correctamente."
      );

      await loadData(true);
    } catch (error) {
      console.error(
        "[EmployeeCompanyChanges] Error resolviendo solicitud:",
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "No se ha podido gestionar la solicitud."
      );
    } finally {
      setProcessingId(null);
    }
  };

  const deleteRequest = async (
    request: CompanyChangeRequest
  ) => {
    const confirmed = window.confirm(
      "¿Quieres eliminar esta solicitud? Esta acción no se puede deshacer."
    );

    if (!confirmed) return;

    setDeletingId(request.id);

    try {
      await assertActiveWorker();

      const { error } = await supabase
        .from("company_change_requests")
        .delete()
        .eq("id", request.id);

      if (error) {
        throw error;
      }

      toast.success("Solicitud eliminada.");

      if (selectedId === request.id) {
        onBackToList();
      }

      await loadData(true);
    } catch (error) {
      console.error(
        "[EmployeeCompanyChanges] Error eliminando solicitud:",
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "No se ha podido eliminar la solicitud."
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (selectedRequest) {
    return (
      <CompanyChangeDetail
        request={selectedRequest}
        companyMap={companyMap}
        profileMap={profileMap}
        workerMap={workerMap}
        processing={processingId === selectedRequest.id}
        deleting={deletingId === selectedRequest.id}
        onBack={onBackToList}
        onOpenMenu={onOpenMenu}
        onResolve={(action) =>
          void resolveRequest(
            selectedRequest,
            action
          )
        }
        onDelete={() =>
          void deleteRequest(selectedRequest)
        }
        onRefresh={() => void loadData(true)}
      />
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFBFC] text-[#172033]">
      <div className="mx-auto max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenMenu}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#5F6B7C] transition-colors hover:bg-white hover:text-[#172033]"
                aria-label="Abrir menú"
              >
                <Menu
                  className="h-5 w-5"
                  strokeWidth={1.8}
                />
              </button>

              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9AA2AE]">
                Operaciones
              </p>
            </div>

            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-[#172033] sm:text-[32px]">
              Cambios de empresa
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7B8594]">
              Consulta y gestión de las solicitudes de cambio
              de empresa realizadas por los usuarios.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="h-10 rounded-lg border-[#E1E5EA] bg-white px-4 text-sm font-medium text-[#536074] shadow-none hover:bg-[#F6F7F9] hover:text-[#172033]"
          >
            {refreshing ? (
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                strokeWidth={1.8}
              />
            ) : (
              <RefreshCw
                className="mr-2 h-4 w-4"
                strokeWidth={1.8}
              />
            )}
            Actualizar
          </Button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Solicitudes"
            value={stats.total}
            icon={Building2}
          />
          <Metric
            label="Pendientes"
            value={stats.pending}
            icon={Clock3}
          />
          <Metric
            label="Aprobadas"
            value={stats.approved}
            icon={CheckCircle2}
          />
          <Metric
            label="Rechazadas"
            value={stats.rejected}
            icon={X}
          />
        </section>

        <Card className="overflow-hidden rounded-xl border-[#E6E9EE] bg-white shadow-none">
          <div className="border-b border-[#EEF1F4] px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#172033]">
                  Solicitudes
                </h2>

                <p className="mt-1 text-xs text-[#8A94A4]">
                  {filteredRequests.length}{" "}
                  {filteredRequests.length === 1
                    ? "resultado"
                    : "resultados"}
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 sm:w-[280px]">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9AA2AE]"
                    strokeWidth={1.8}
                  />

                  <Input
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                    placeholder="Buscar usuario o empresa..."
                    className="h-10 rounded-lg border-[#E1E5EA] bg-white pl-9 text-sm shadow-none placeholder:text-[#A3ABB7] focus-visible:ring-1 focus-visible:ring-[#CBD5E1]"
                  />
                </div>

                <Select
                  value={statusFilter}
                  onValueChange={(value) =>
                    setStatusFilter(
                      value as "all" | ChangeStatus
                    )
                  }
                >
                  <SelectTrigger className="h-10 w-full rounded-lg border-[#E1E5EA] bg-white text-sm text-[#536074] shadow-none sm:w-[170px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="all">
                      Todos los estados
                    </SelectItem>
                    <SelectItem value="pending">
                      Pendientes
                    </SelectItem>
                    <SelectItem value="approved">
                      Aprobadas
                    </SelectItem>
                    <SelectItem value="rejected">
                      Rechazadas
                    </SelectItem>
                    <SelectItem value="cancelled">
                      Canceladas
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={companyFilter}
                  onValueChange={setCompanyFilter}
                >
                  <SelectTrigger className="h-10 w-full rounded-lg border-[#E1E5EA] bg-white text-sm text-[#536074] shadow-none sm:w-[200px]">
                    <SelectValue placeholder="Empresa" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="all">
                      Todas las empresas
                    </SelectItem>

                    {companyOptions.map((company) => (
                      <SelectItem
                        key={company.id}
                        value={company.id}
                      >
                        {company.company_name || "Sin nombre"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-[#7B8594]">
                <Loader2
                  className="h-4 w-4 animate-spin"
                  strokeWidth={1.8}
                />
                Cargando solicitudes...
              </div>
            </div>
          ) : filteredRequests.length === 0 ? (
            <EmptyState
              hasFilters={
                Boolean(search) ||
                statusFilter !== "all" ||
                companyFilter !== "all"
              }
            />
          ) : (
            <div className="divide-y divide-[#EEF1F4]">
              {filteredRequests.map((request) => {
                const requester = profileMap.get(
                  request.user_id
                );

                const currentCompany =
                  request.current_company_id
                    ? companyMap.get(
                        request.current_company_id
                      )
                    : undefined;

                const requestedCompany =
                  request.requested_company_id
                    ? companyMap.get(
                        request.requested_company_id
                      )
                    : undefined;

                return (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() =>
                      onOpenRequest(request.id)
                    }
                    className="group flex w-full flex-col gap-4 px-5 py-5 text-left transition-colors hover:bg-[#FBFCFD] sm:px-6 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            statusClasses(
                              request.status
                            ),
                          ].join(" ")}
                        >
                          {statusLabel(
                            request.status
                          )}
                        </span>

                        <span className="text-[11px] text-[#A0A8B4]">
                          {formatDateShort(
                            request.created_at
                          )}
                        </span>
                      </div>

                      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                        <p className="truncate text-sm font-semibold text-[#273247]">
                          {requester?.nombre ||
                            requester?.email ||
                            "Usuario sin nombre"}
                        </p>

                        {requester?.email && (
                          <>
                            <span className="hidden text-[#C5CAD2] sm:inline">
                              ·
                            </span>

                            <p className="truncate text-xs text-[#8A94A4]">
                              {requester.email}
                            </p>
                          </>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <CompanyPill
                          company={
                            currentCompany?.company_name ||
                            "Sin empresa"
                          }
                          muted
                        />

                        <span className="text-[#B1B8C3]">
                          →
                        </span>

                        <CompanyPill
                          company={
                            requestedCompany?.company_name ||
                            request.requested_company_name ||
                            "Empresa solicitada"
                          }
                        />
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-5 lg:pl-6">
                      <div className="hidden text-right sm:block">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A0A8B4]">
                          Última actualización
                        </p>

                        <p className="mt-1 text-xs text-[#667085]">
                          {formatDate(
                            request.updated_at
                          )}
                        </p>
                      </div>

                      <span className="text-[#A1A9B5] transition-transform group-hover:translate-x-0.5">
                        →
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

/* ============================================================================
   MÉTRICA
   ========================================================================== */

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: ComponentType<{
    className?: string;
    strokeWidth?: number;
  }>;
}) {
  return (
    <Card className="rounded-xl border-[#E6E9EE] bg-white p-5 shadow-none">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#8A94A4]">
            {label}
          </p>

          <p className="mt-2 text-[25px] font-semibold tracking-[-0.035em] text-[#172033]">
            {value}
          </p>
        </div>

        <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#F6F7F9] text-[#6F7988]">
          <Icon
            className="h-4 w-4"
            strokeWidth={1.8}
          />
        </div>
      </div>
    </Card>
  );
}

/* ============================================================================
   ESTADO VACÍO
   ========================================================================== */

function EmptyState({
  hasFilters,
}: {
  hasFilters: boolean;
}) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center px-6 text-center">
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#F6F7F9] text-[#7B8594]">
        <Building2
          className="h-5 w-5"
          strokeWidth={1.7}
        />
      </div>

      <h3 className="mt-4 text-sm font-semibold text-[#273247]">
        {hasFilters
          ? "No hay solicitudes que coincidan"
          : "No hay solicitudes de cambio"}
      </h3>

      <p className="mt-1 max-w-md text-xs leading-5 text-[#8A94A4]">
        {hasFilters
          ? "Prueba a cambiar los filtros o la búsqueda."
          : "Cuando un usuario solicite cambiar de empresa, la solicitud aparecerá aquí."}
      </p>
    </div>
  );
}

/* ============================================================================
   DETALLE
   ========================================================================== */

function CompanyChangeDetail({
  request,
  companyMap,
  profileMap,
  workerMap,
  processing,
  deleting,
  onBack,
  onOpenMenu,
  onResolve,
  onDelete,
  onRefresh,
}: {
  request: CompanyChangeRequest;
  companyMap: Map<string, Company>;
  profileMap: Map<string, Profile>;
  workerMap: Map<string, Worker>;
  processing: boolean;
  deleting: boolean;
  onBack: () => void;
  onOpenMenu: () => void;
  onResolve: (action: "approved" | "rejected") => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const profile = profileMap.get(request.user_id);

  const currentCompany = request.current_company_id
    ? companyMap.get(request.current_company_id)
    : undefined;

  const requestedCompany = request.requested_company_id
    ? companyMap.get(request.requested_company_id)
    : undefined;

  const reviewer = request.reviewed_by
    ? workerMap.get(request.reviewed_by)
    : undefined;

  const [reviewNotes, setReviewNotes] = useState(
    request.review_notes || ""
  );
  const [savingNotes, setSavingNotes] =
    useState(false);

  useEffect(() => {
    setReviewNotes(request.review_notes || "");
  }, [request.id, request.review_notes]);

  const saveNotes = async () => {
    setSavingNotes(true);

    try {
      await assertActiveWorker();

      const { error } = await supabase
        .from("company_change_requests")
        .update({
          review_notes:
            reviewNotes.trim() || null,
        })
        .eq("id", request.id);

      if (error) {
        throw error;
      }

      toast.success("Notas internas guardadas.");
      onRefresh();
    } catch (error) {
      console.error(
        "[EmployeeCompanyChanges] Error guardando notas:",
        error
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "No se han podido guardar las notas."
      );
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FAFBFC] text-[#172033]">
      <div className="mx-auto max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onOpenMenu}
              className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#5F6B7C] transition-colors hover:bg-white hover:text-[#172033]"
              aria-label="Abrir menú"
            >
              <Menu
                className="h-5 w-5"
                strokeWidth={1.8}
              />
            </button>

            <div>
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 text-xs font-medium text-[#7B8594] transition-colors hover:text-[#172033]"
              >
                <ArrowLeft
                  className="h-4 w-4"
                  strokeWidth={1.8}
                />
                Cambios de empresa
              </button>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[#172033] sm:text-[32px]">
                  Solicitud de cambio
                </h1>

                <span
                  className={[
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    statusClasses(
                      request.status
                    ),
                  ].join(" ")}
                >
                  {statusLabel(request.status)}
                </span>
              </div>

              <p className="mt-2 text-sm text-[#7B8594]">
                {formatDate(request.created_at)}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={onRefresh}
            className="h-10 shrink-0 rounded-lg border-[#E1E5EA] bg-white px-4 text-sm font-medium text-[#536074] shadow-none hover:bg-[#F6F7F9] hover:text-[#172033]"
          >
            <RefreshCw
              className="mr-2 h-4 w-4"
              strokeWidth={1.8}
            />
            Actualizar
          </Button>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <Card className="rounded-xl border-[#E6E9EE] bg-white shadow-none">
              <div className="border-b border-[#EEF1F4] px-5 py-4 sm:px-6">
                <h2 className="text-sm font-semibold text-[#172033]">
                  Cambio solicitado
                </h2>

                <p className="mt-1 text-xs text-[#8A94A4]">
                  Información de la solicitud y de las empresas implicadas.
                </p>
              </div>

              <div className="px-5 py-5 sm:px-6">
                <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr] md:items-center">
                  <CompanyDetailCard
                    eyebrow="Empresa actual"
                    company={
                      currentCompany?.company_name ||
                      "Sin empresa"
                    }
                    companyCode={
                      currentCompany?.company_code
                    }
                    muted
                  />

                  <div className="flex justify-center text-[#A2AAB6]">
                    <span className="hidden md:inline text-xl">
                      →
                    </span>

                    <span className="md:hidden text-xl">
                      ↓
                    </span>
                  </div>

                  <CompanyDetailCard
                    eyebrow="Empresa solicitada"
                    company={
                      requestedCompany?.company_name ||
                      request.requested_company_name ||
                      "Empresa no identificada"
                    }
                    companyCode={
                      requestedCompany?.company_code
                    }
                  />
                </div>
              </div>
            </Card>

            <Card className="rounded-xl border-[#E6E9EE] bg-white shadow-none">
              <div className="border-b border-[#EEF1F4] px-5 py-4 sm:px-6">
                <h2 className="text-sm font-semibold text-[#172033]">
                  Motivo
                </h2>
              </div>

              <div className="px-5 py-5 sm:px-6">
                {request.reason ? (
                  <p className="whitespace-pre-wrap text-sm leading-6 text-[#536074]">
                    {request.reason}
                  </p>
                ) : (
                  <p className="text-sm text-[#9AA2AE]">
                    El usuario no indicó un motivo.
                  </p>
                )}
              </div>
            </Card>

            <Card className="rounded-xl border-[#E6E9EE] bg-white shadow-none">
              <div className="border-b border-[#EEF1F4] px-5 py-4 sm:px-6">
                <div>
                  <h2 className="text-sm font-semibold text-[#172033]">
                    Notas internas
                  </h2>

                  <p className="mt-1 text-xs text-[#8A94A4]">
                    Información interna para la gestión de la solicitud.
                  </p>
                </div>
              </div>

              <div className="px-5 py-5 sm:px-6">
                <textarea
                  value={reviewNotes}
                  onChange={(event) =>
                    setReviewNotes(
                      event.target.value.slice(0, 5000)
                    )
                  }
                  placeholder="Añade una nota interna..."
                  rows={5}
                  className="w-full resize-y rounded-lg border border-[#E1E5EA] bg-white px-3 py-2.5 text-sm leading-6 text-[#344154] outline-none transition-colors placeholder:text-[#A3ABB7] focus:border-[#C7D0DC] focus:ring-1 focus:ring-[#E1E5EA]"
                />

                <div className="mt-3 flex items-center justify-between gap-4">
                  <p className="text-[11px] text-[#A0A8B4]">
                    {reviewNotes.length}/5000
                  </p>

                  <Button
                    type="button"
                    onClick={() => void saveNotes()}
                    disabled={savingNotes}
                    className="h-9 rounded-lg bg-[#172033] px-4 text-xs font-semibold text-white shadow-none hover:bg-[#253149]"
                  >
                    {savingNotes && (
                      <Loader2
                        className="mr-2 h-3.5 w-3.5 animate-spin"
                        strokeWidth={1.8}
                      />
                    )}
                    Guardar notas
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          <aside className="space-y-5">
            <Card className="rounded-xl border-[#E6E9EE] bg-white shadow-none">
              <div className="border-b border-[#EEF1F4] px-5 py-4">
                <h2 className="text-sm font-semibold text-[#172033]">
                  Usuario
                </h2>
              </div>

              <div className="space-y-4 px-5 py-5">
                <InfoRow
                  label="Nombre"
                  value={
                    profile?.nombre ||
                    "Sin nombre"
                  }
                />

                <InfoRow
                  label="Email"
                  value={
                    profile?.email ||
                    "—"
                  }
                />

                <InfoRow
                  label="Teléfono"
                  value={
                    profile?.telefono ||
                    "—"
                  }
                />

                <InfoRow
                  label="Rol"
                  value={
                    profile?.rol ||
                    "—"
                  }
                />

                <InfoRow
                  label="ID de usuario"
                  value={request.user_id}
                  mono
                />
              </div>
            </Card>

            <Card className="rounded-xl border-[#E6E9EE] bg-white shadow-none">
              <div className="border-b border-[#EEF1F4] px-5 py-4">
                <h2 className="text-sm font-semibold text-[#172033]">
                  Historial
                </h2>
              </div>

              <div className="space-y-4 px-5 py-5">
                <TimelineItem
                  label="Solicitud creada"
                  value={formatDate(
                    request.created_at
                  )}
                  active
                />

                {request.reviewed_at && (
                  <TimelineItem
                    label={
                      request.status ===
                      "approved"
                        ? "Solicitud aprobada"
                        : request.status ===
                          "rejected"
                        ? "Solicitud rechazada"
                        : "Solicitud revisada"
                    }
                    value={formatDate(
                      request.reviewed_at
                    )}
                    active
                  />
                )}

                {request.reviewed_by && (
                  <TimelineItem
                    label="Gestionada por"
                    value={
                      reviewer?.display_name ||
                      "Trabajador"
                    }
                    active
                  />
                )}

                <TimelineItem
                  label="Última actualización"
                  value={formatDate(
                    request.updated_at
                  )}
                  active
                />
              </div>
            </Card>

            {request.status === "pending" && (
              <Card className="rounded-xl border-[#E6E9EE] bg-white p-5 shadow-none">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">
                  Gestión
                </p>

                <p className="mt-2 text-sm leading-5 text-[#536074]">
                  Esta solicitud está pendiente de revisión.
                </p>

                <div className="mt-4 grid gap-2">
                  <Button
                    type="button"
                    onClick={() =>
                      onResolve("approved")
                    }
                    disabled={processing}
                    className="h-10 rounded-lg bg-[#172033] text-sm font-semibold text-white shadow-none hover:bg-[#253149]"
                  >
                    {processing ? (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        strokeWidth={1.8}
                      />
                    ) : (
                      <Check
                        className="mr-2 h-4 w-4"
                        strokeWidth={1.9}
                      />
                    )}
                    Aprobar solicitud
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      onResolve("rejected")
                    }
                    disabled={processing}
                    className="h-10 rounded-lg border-[#E1E5EA] bg-white text-sm font-medium text-[#667085] shadow-none hover:bg-[#FFF5F5] hover:text-[#9A4545]"
                  >
                    Rechazar solicitud
                  </Button>
                </div>
              </Card>
            )}

            <Card className="rounded-xl border-[#E6E9EE] bg-white p-5 shadow-none">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA2AE]">
                Identificador
              </p>

              <p className="mt-2 break-all font-mono text-[11px] leading-5 text-[#667085]">
                {request.id}
              </p>
            </Card>

            <Button
              type="button"
              variant="outline"
              onClick={onDelete}
              disabled={deleting}
              className="h-10 w-full rounded-lg border-[#E7DADA] bg-white text-sm font-medium text-[#9A4545] shadow-none hover:bg-[#FFF5F5]"
            >
              {deleting ? (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  strokeWidth={1.8}
                />
              ) : (
                <Trash2
                  className="mr-2 h-4 w-4"
                  strokeWidth={1.8}
                />
              )}
              Eliminar solicitud
            </Button>
          </aside>
        </section>
      </div>
    </main>
  );
}

/* ============================================================================
   COMPONENTES DE DETALLE
   ========================================================================== */

function CompanyDetailCard({
  eyebrow,
  company,
  companyCode,
  muted,
}: {
  eyebrow: string;
  company: string;
  companyCode?: string | null;
  muted?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-xl border p-4",
        muted
          ? "border-[#EEF1F4] bg-[#FBFCFD]"
          : "border-[#E3E8EE] bg-white",
      ].join(" ")}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9AA2AE]">
        {eyebrow}
      </p>

      <div className="mt-3 flex items-start gap-3">
        <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F6F7F9] text-[#687386]">
          <Building2
            className="h-4 w-4"
            strokeWidth={1.7}
          />
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#273247]">
            {company}
          </p>

          {companyCode && (
            <p className="mt-1 font-mono text-[11px] text-[#8A94A4]">
              {companyCode}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CompanyPill({
  company,
  muted,
}: {
  company: string;
  muted?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1",
        muted
          ? "border-[#EEF1F4] bg-[#FBFCFD] text-[#7B8594]"
          : "border-[#E5E9EE] bg-white text-[#536074]",
      ].join(" ")}
    >
      <Building2
        className="h-3 w-3 shrink-0"
        strokeWidth={1.8}
      />

      <span className="truncate">
        {company}
      </span>
    </span>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A0A8B4]">
        {label}
      </p>

      <p
        className={[
          "mt-1 break-words text-sm text-[#536074]",
          mono ? "font-mono text-[11px]" : "",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function TimelineItem({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={[
            "mt-0.5 h-2 w-2 rounded-full",
            active
              ? "bg-[#6B7788]"
              : "bg-[#D7DCE3]",
          ].join(" ")}
        />

        <span className="mt-1 h-full w-px bg-[#EEF1F4]" />
      </div>

      <div className="min-w-0 pb-1">
        <p className="text-xs font-medium text-[#536074]">
          {label}
        </p>

        <p className="mt-1 text-[11px] leading-5 text-[#929BA8]">
          {value}
        </p>
      </div>
    </div>
  );
}
