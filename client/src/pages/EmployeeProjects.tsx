import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { LucideIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  BarChart3,
  ArrowLeft,
  BellRing,
  ArrowUpDown,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  FileText,
  Filter,
  FolderKanban,
  Loader2,
  MessageSquare,
  Menu,
  CreditCard,
  CircleDollarSign,
  Ticket,
  Bell,
  Zap,
  Activity,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Upload,
  User,
  X,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type ProjectStatus =
  | "Pendiente"
  | "Activo"
  | "Pausado"
  | "Entregado"
  | "Completado";

type MilestoneStatus = "pendiente" | "en_curso" | "completado";

type SortOption =
  | "recent"
  | "name"
  | "start"
  | "deadline"
  | "progress";

interface Project {
  id: string;
  nombre: string;
  descripcion: string | null;
  estado: ProjectStatus;
  fecha_inicio: string;
  fecha_fin: string | null;
  company_id: string | null;
  client_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at?: string | null;
  cliente_nombre: string;
  cliente_email: string;
  empresa_nombre: string;
}

interface ProjectProgress {
  project_id: string;
  total_milestones: number;
  completed_milestones: number;
  progress_percentage: number;
}

interface ProjectMilestone {
  id: string;
  project_id: string;
  nombre: string;
  descripcion: string | null;
  fecha_prevista: string;
  orden: number;
  estado: MilestoneStatus;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectDocument {
  id: string;
  project_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectUpdate {
  id: string;
  project_id: string;
  titulo: string;
  contenido: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectChangeRequest {
  id: string;
  project_id: string;
  user_id: string | null;
  company_id: string | null;
  client_id: string | null;
  description: string;
  status: "pending" | "in_review" | "accepted" | "rejected" | "completed";
  requested_at?: string | null;
  created_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
}

interface RelatedBilling {
  id: string;
  numero_factura: string | null;
  estado: string | null;
  monto: number | null;
  importe_a_pagar?: number | null;
  fecha_vencimiento: string | null;
}

interface RelatedQuotation {
  id: string;
  numero_presupuesto: string | null;
  titulo: string | null;
  estado: string | null;
  precio_total: number | null;
}

interface RelatedTicket {
  id: string;
  asunto: string | null;
  estado: string | null;
  prioridad: string | null;
  created_at: string;
}

interface EmployeeProjectsProps {
  /**
   * Se mantiene por compatibilidad con el contenedor actual.
   * La creación se gestiona aquí para que la página sea autocontenida
   * y utilice la RPC autorizada para workers.
   */
  onCreateProject?: () => void;
  onEditProject?: (project: Project) => void;
  editPathBase?: string;
  /** Optional bridge to the parent EmployeeArea navigation. */
  onMenuNavigate?: (id: string) => void;
}

interface ProjectCreationClient {
  id: string;
  company_id: string | null;
  profile_id: string | null;
  nombre: string;
  email: string | null;
  empresa: string | null;
  is_active: boolean;
}

const STATUS_OPTIONS: Array<{
  value: "all" | ProjectStatus;
  label: string;
}> = [
  { value: "all", label: "Todos los estados" },
  { value: "Pendiente", label: "Pendiente" },
  { value: "Activo", label: "Activo" },
  { value: "Pausado", label: "Pausado" },
  { value: "Entregado", label: "Entregado" },
  { value: "Completado", label: "Completado" },
];

const SORT_OPTIONS: Array<{
  value: SortOption;
  label: string;
}> = [
  { value: "recent", label: "Más recientes" },
  { value: "name", label: "Nombre A-Z" },
  { value: "start", label: "Fecha de inicio" },
  { value: "deadline", label: "Fecha de fin" },
  { value: "progress", label: "Progreso" },
];

export default function EmployeeProjects(props: EmployeeProjectsProps) {
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const base = props.editPathBase?.replace(/\/+$/, "") || "/employee/projects";
  const employeeRoot = base.replace(/\/projects$/, "") || "/employee";
  const projectId = getProjectIdFromPath(location, base);

  const navigateFromMenu = useCallback(
    (id: string) => {
      setMenuOpen(false);

      if (props.onMenuNavigate) {
        props.onMenuNavigate(id);
        return;
      }

      const pathMap: Record<string, string> = {
        dashboard: employeeRoot,
        projects: base,
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

      const target = pathMap[id];
      if (target) setLocation(target);
    },
    [base, employeeRoot, props.onMenuNavigate, setLocation]
  );

  const navigation = (
    <EmployeeProjectsNavigation
      open={menuOpen}
      location={location}
      employeeRoot={employeeRoot}
      projectBase={base}
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

  if (projectId) {
    return (
      <>
        {navigation}
        {overlay}
        <EmployeeProjectDetail
          projectId={projectId}
          onBack={() => setLocation(base)}
          onNavigate={setLocation}
          onOpenMenu={() => setMenuOpen(true)}
        />
      </>
    );
  }

  return (
    <>
      {navigation}
      {overlay}
      <EmployeeProjectList
        {...props}
        onOpenMenu={() => setMenuOpen(true)}
        onOpenProject={(project) => {
          const detailUrl = `${window.location.origin}${base}/${project.id}`;
          const opened = window.open(detailUrl, "_blank", "noopener,noreferrer");

          if (!opened) {
            setLocation(`${base}/${project.id}`);
          }
        }}
      />
    </>
  );
}

/* ============================================================================
   NAVEGACIÓN DEL ÁREA DE EMPLEADO
   ========================================================================== */

function EmployeeProjectsNavigation({
  open,
  location,
  employeeRoot,
  projectBase,
  onClose,
  onNavigate,
}: {
  open: boolean;
  location: string;
  employeeRoot: string;
  projectBase: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const groups: Array<{
    title: string;
    items: Array<{
      id: string;
      label: string;
      icon: LucideIcon;
    }>;
  }> = [
    { title: "Principal", items: [{ id: "dashboard", label: "Dashboard", icon: BarChart3 }] },
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
    if (id === "projects") return location === projectBase || location.startsWith(`${projectBase}/`);
    if (id === "dashboard") return location === employeeRoot || location === `${employeeRoot}/`;
    return location === `${employeeRoot}/${id}` || location.startsWith(`${employeeRoot}/${id}/`);
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[86vw] flex-col border-r border-[#E6E9EE] bg-white transition-transform duration-200 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
      aria-hidden={!open}
    >
      <div className="flex h-[72px] items-center justify-between border-b border-[#EEF1F4] px-6">
        <div>
          <p className="text-lg font-semibold tracking-[-0.025em] text-[#172033]">MODIRA</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9AA2AE]">Operaciones</p>
        </div>
        <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#7B8594] transition-colors hover:bg-[#F6F7F9] hover:text-[#172033]" aria-label="Cerrar menú">
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
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                        active ? "bg-[#EEF3FF] font-semibold text-[#1E3A8A]" : "font-medium text-[#536074] hover:bg-[#F6F7F9] hover:text-[#172033]",
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

/* ============================================================================
   LISTADO
   ========================================================================== */

function EmployeeProjectList({
  onOpenProject,
  onOpenMenu,
}: EmployeeProjectsProps & {
  onOpenProject: (project: Project) => void;
  onOpenMenu: () => void;
}) {
  const { user } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [progressByProject, setProgressByProject] = useState<
    Record<string, ProjectProgress>
  >({});
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectStatus>("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [sortOption, setSortOption] = useState<SortOption>("recent");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ============================================================
  // CREACIÓN DE PROYECTOS — WORKER
  // ============================================================

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [creationCompanies, setCreationCompanies] = useState<
    Array<{ id: string; company_name: string }>
  >([]);
  const [creationClients, setCreationClients] = useState<
    ProjectCreationClient[]
  >([]);
  const [loadingCreationOptions, setLoadingCreationOptions] = useState(false);
  const [creationForm, setCreationForm] = useState({
    company_id: "",
    client_id: "",
    nombre: "",
    descripcion: "",
    fecha_inicio: "",
    fecha_fin: "",
  });

  const resetCreationForm = useCallback(() => {
    setCreationForm({
      company_id: "",
      client_id: "",
      nombre: "",
      descripcion: "",
      fecha_inicio: getTodayForInput(),
      fecha_fin: "",
    });
    setCreationError(null);
  }, []);

  const openCreateProject = useCallback(async () => {
    resetCreationForm();
    setShowCreateProject(true);
    setLoadingCreationOptions(true);

    try {
      const [companiesResult, clientsResult] = await Promise.all([
        supabase
          .from("companies")
          .select("id, company_name")
          .order("company_name", { ascending: true }),
        supabase
          .from("clients")
          .select(
            "id, company_id, profile_id, nombre, email, empresa, is_active"
          )
          .eq("is_active", true)
          .order("nombre", { ascending: true }),
      ]);

      if (companiesResult.error) throw companiesResult.error;
      if (clientsResult.error) throw clientsResult.error;

      setCreationCompanies((companiesResult.data || []) as Array<{
        id: string;
        company_name: string;
      }>);
      setCreationClients((clientsResult.data || []) as ProjectCreationClient[]);
    } catch (err: any) {
      console.error("[EmployeeProjects] Error loading creation options:", err);
      setCreationError(
        err?.message ||
          "No se pudieron cargar las empresas y clientes disponibles."
      );
    } finally {
      setLoadingCreationOptions(false);
    }
  }, [resetCreationForm]);

  const closeCreateProject = useCallback(() => {
    if (creatingProject) return;
    setShowCreateProject(false);
    setCreationError(null);
  }, [creatingProject]);

  const loadProjects = useCallback(
    async (silent = false) => {
      if (!user) {
        setProjects([]);
        setLoading(false);
        return;
      }

      try {
        if (silent) setRefreshing(true);
        else setLoading(true);

        setError(null);

        const { data, error: projectsError } =
          await supabase.rpc("get_worker_projects");

        if (projectsError) throw projectsError;

        const resolvedProjects = (data || []) as Project[];
        setProjects(resolvedProjects);

        if (!resolvedProjects.length) {
          setProgressByProject({});
          setMilestones([]);
          return;
        }

        const ids = resolvedProjects.map((project) => project.id);

        const [progressResult, milestonesResult] = await Promise.all([
          supabase
            .from("project_progress")
            .select(
              "project_id, total_milestones, completed_milestones, progress_percentage"
            )
            .in("project_id", ids),

          supabase
            .from("project_milestones")
            .select(
              "id, project_id, nombre, descripcion, fecha_prevista, orden, estado, completed_at, created_by, created_at, updated_at"
            )
            .in("project_id", ids)
            .order("orden", { ascending: true })
            .order("fecha_prevista", { ascending: true }),
        ]);

        const resolvedMilestones = milestonesResult.error
          ? []
          : ((milestonesResult.data || []) as ProjectMilestone[]);

        setMilestones(resolvedMilestones);

        const progressMap: Record<string, ProjectProgress> = {};

        if (!progressResult.error) {
          for (const row of (progressResult.data || []) as ProjectProgress[]) {
            progressMap[row.project_id] = row;
          }
        }

        for (const id of ids) {
          if (!progressMap[id]) {
            const list = resolvedMilestones.filter(
              (milestone) => milestone.project_id === id
            );
            const total = list.length;
            const completed = list.filter(
              (milestone) => milestone.estado === "completado"
            ).length;

            progressMap[id] = {
              project_id: id,
              total_milestones: total,
              completed_milestones: completed,
              progress_percentage: total
                ? Math.round((completed / total) * 100)
                : 0,
            };
          }
        }

        setProgressByProject(progressMap);
      } catch (err: any) {
        console.error("[EmployeeProjects] Error loading projects:", err);
        setError(err?.message || "No se pudieron cargar los proyectos.");
        setProjects([]);
        setProgressByProject({});
        setMilestones([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  const handleCreateProject = useCallback(async () => {
    setCreationError(null);

    const name = creationForm.nombre.trim();
    const description = creationForm.descripcion.trim();

    if (!creationForm.client_id) {
      setCreationError("Selecciona el cliente propietario del proyecto.");
      return;
    }

    if (!name) {
      setCreationError("Introduce un nombre para el proyecto.");
      return;
    }

    if (name.length > 200) {
      setCreationError("El nombre del proyecto no puede superar 200 caracteres.");
      return;
    }

    if (!description) {
      setCreationError("Introduce una descripción para el proyecto.");
      return;
    }

    if (description.length > 5000) {
      setCreationError(
        "La descripción del proyecto no puede superar 5000 caracteres."
      );
      return;
    }

    if (!creationForm.fecha_inicio) {
      setCreationError("Selecciona una fecha de inicio.");
      return;
    }

    const startDate = new Date(`${creationForm.fecha_inicio}T00:00:00`);
    const endDate = creationForm.fecha_fin
      ? new Date(`${creationForm.fecha_fin}T00:00:00`)
      : null;

    if (Number.isNaN(startDate.getTime())) {
      setCreationError("La fecha de inicio no es válida.");
      return;
    }

    if (endDate && Number.isNaN(endDate.getTime())) {
      setCreationError("La fecha de fin no es válida.");
      return;
    }

    if (endDate && endDate < startDate) {
      setCreationError(
        "La fecha de fin no puede ser anterior a la fecha de inicio."
      );
      return;
    }

    const selectedClient = creationClients.find(
      (client) => client.id === creationForm.client_id
    );

    if (!selectedClient) {
      setCreationError("El cliente seleccionado ya no está disponible.");
      return;
    }

    if (!selectedClient.profile_id) {
      setCreationError(
        "El cliente seleccionado no está vinculado a un usuario de Modira."
      );
      return;
    }

    try {
      setCreatingProject(true);

      /*
       * La migración 003 define create_project_by_worker(p_client_id,
       * p_descripcion, p_fecha_inicio, p_fecha_fin) como la frontera
       * autorizada para crear proyectos desde el área interna.
       *
       * La RPC deriva en servidor company_id y user_id/profile_id;
       * el frontend nunca puede imponer esos valores.
       */
      const { data: createdData, error: createError } = await supabase.rpc(
        "create_project_by_worker",
        {
          p_client_id: creationForm.client_id,
          p_descripcion: description,
          p_fecha_inicio: startDate.toISOString(),
          p_fecha_fin: endDate ? endDate.toISOString() : null,
        }
      );

      if (createError) throw createError;

      const createdProject = Array.isArray(createdData)
        ? createdData[0]
        : createdData;

      if (!createdProject?.id) {
        throw new Error("No se recibió el proyecto creado.");
      }

      /*
       * create_project_by_worker utiliza deliberadamente el nombre
       * "Proyecto sin título". El contrato existente de workers para
       * modificar proyectos expone update_project_by_worker(), por lo
       * que aplicamos el nombre mediante esa misma RPC protegida.
       */
      const { data: renamedProject, error: renameError } = await supabase.rpc(
        "update_project_by_worker",
        {
          p_project_id: createdProject.id,
          p_nombre: name,
          p_estado: null,
        }
      );

      if (renameError) {
        throw new Error(
          `El proyecto se creó, pero no se pudo establecer su nombre: ${
            renameError.message || "error desconocido"
          }`
        );
      }

      const finalProject = Array.isArray(renamedProject)
        ? renamedProject[0]
        : renamedProject;

      setShowCreateProject(false);
      resetCreationForm();
      await loadProjects(true);

      toast.success("Proyecto creado correctamente.");

      // Reutilizamos el mismo flujo de apertura de proyectos que el listado.
      // La navegación (ruta, nueva pestaña y fallback) pertenece al componente padre.
      if (finalProject?.id) {
        onOpenProject(finalProject as Project);
      }
    } catch (err: any) {
      console.error("[EmployeeProjects] Error creating project:", err);
      setCreationError(
        err?.message || "No se pudo crear el proyecto."
      );
    } finally {
      setCreatingProject(false);
    }
  }, [
    creationClients,
    creationForm,
    loadProjects,
    onOpenProject,
    resetCreationForm,
  ]);

  const availableCreationClients = useMemo(() => {
    if (!creationForm.company_id) return creationClients;

    return creationClients.filter(
      (client) => String(client.company_id || "") === creationForm.company_id
    );
  }, [creationClients, creationForm.company_id]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const companies = useMemo(() => {
    const map = new Map<string, string>();

    for (const project of projects) {
      if (project.company_id) {
        map.set(
          project.company_id,
          project.empresa_nombre || "Empresa sin nombre"
        );
      }
    }

    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "es")
    );
  }, [projects]);

  const users = useMemo(() => {
    const map = new Map<string, { name: string; email: string }>();

    for (const project of projects) {
      if (!project.user_id) continue;

      map.set(project.user_id, {
        name: project.cliente_nombre || "Usuario sin nombre",
        email: project.cliente_email || "",
      });
    }

    return Array.from(map.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name, "es")
    );
  }, [projects]);

  const stats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((p) => p.estado === "Activo").length;
    const pending = projects.filter((p) => p.estado === "Pendiente").length;
    const completed = projects.filter((p) =>
      ["Entregado", "Completado"].includes(p.estado)
    ).length;

    const progressRows = projects
      .map((project) => progressByProject[project.id])
      .filter(Boolean);

    const averageProgress = progressRows.length
      ? Math.round(
          progressRows.reduce(
            (sum, row) => sum + Number(row.progress_percentage || 0),
            0
          ) / progressRows.length
        )
      : 0;

    return { total, active, pending, completed, averageProgress };
  }, [projects, progressByProject]);

  const getNextMilestone = useCallback(
    (projectId: string) => {
      return (
        milestones
          .filter(
            (milestone) =>
              milestone.project_id === projectId &&
              milestone.estado !== "completado"
          )
          .sort(
            (a, b) =>
              new Date(a.fecha_prevista).getTime() -
              new Date(b.fecha_prevista).getTime()
          )[0] || null
      );
    },
    [milestones]
  );

  const filteredProjects = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    const result = projects.filter((project) => {
      const searchMatch =
        !search ||
        [
          project.nombre,
          project.descripcion,
          project.cliente_nombre,
          project.cliente_email,
          project.empresa_nombre,
        ].some((value) =>
          String(value || "").toLowerCase().includes(search)
        );

      const statusMatch =
        statusFilter === "all" || project.estado === statusFilter;

      const companyMatch =
        companyFilter === "all" || project.company_id === companyFilter;

      const userMatch =
        userFilter === "all" || project.user_id === userFilter;

      return searchMatch && statusMatch && companyMatch && userMatch;
    });

    result.sort((a, b) => {
      switch (sortOption) {
        case "name":
          return a.nombre.localeCompare(b.nombre, "es");
        case "start":
          return (
            new Date(a.fecha_inicio || 0).getTime() -
            new Date(b.fecha_inicio || 0).getTime()
          );
        case "deadline":
          return (
            new Date(a.fecha_fin || "9999-12-31").getTime() -
            new Date(b.fecha_fin || "9999-12-31").getTime()
          );
        case "progress":
          return (
            Number(progressByProject[b.id]?.progress_percentage || 0) -
            Number(progressByProject[a.id]?.progress_percentage || 0)
          );
        default:
          return (
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
          );
      }
    });

    return result;
  }, [
    projects,
    progressByProject,
    searchTerm,
    statusFilter,
    companyFilter,
    userFilter,
    sortOption,
  ]);

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setCompanyFilter("all");
    setUserFilter("all");
    setSortOption("recent");
  };

  const hasFilters =
    Boolean(searchTerm.trim()) ||
    statusFilter !== "all" ||
    companyFilter !== "all" ||
    userFilter !== "all";

  const activeFilterCount = [
    statusFilter !== "all",
    companyFilter !== "all",
    userFilter !== "all",
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-5 sm:p-6 lg:p-8">
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
            <p className="text-sm font-semibold text-[#263044]">Proyectos</p>
            <p className="text-xs text-[#939CAA]">Gestión y seguimiento de proyectos</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-[#64748B]">
              <FolderKanban className="h-4 w-4 text-[#1E3A8A]" />
              <span>Operaciones</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>Proyectos</span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight">Proyectos</h1>
            <p className="mt-1 text-sm text-[#64748B]">
              Vista general de los proyectos gestionados por Modira.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => loadProjects(true)}
              disabled={loading || refreshing}
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Actualizar
            </Button>

            <Button
              onClick={openCreateProject}
              className="bg-[#1E3A8A] text-white hover:bg-[#162D6B]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuevo proyecto
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
          <SummaryCard
            icon={<FolderKanban className="h-5 w-5" />}
            label="Total"
            value={stats.total}
            detail={`${companies.length} empresas`}
          />
          <SummaryCard
            icon={<CircleDot className="h-5 w-5" />}
            label="Activos"
            value={stats.active}
            detail="En curso"
          />
          <SummaryCard
            icon={<Clock3 className="h-5 w-5" />}
            label="Pendientes"
            value={stats.pending}
            detail="Por comenzar"
          />
          <SummaryCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Finalizados"
            value={stats.completed}
            detail="Entregados o completados"
          />
          <SummaryCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Progreso medio"
            value={`${stats.averageProgress}%`}
            detail="Calculado por hitos"
            className="col-span-2 xl:col-span-1"
          />
        </div>

        <Card className="overflow-visible border border-slate-200 bg-white shadow-none">
          <div className="p-4 lg:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar proyecto, cliente, empresa o email..."
                  className="h-10 border-slate-200 bg-slate-50 pl-9 focus-visible:ring-[#1E3A8A]"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filtersOpen ? "default" : "outline"}
                  onClick={() => setFiltersOpen((value) => !value)}
                  className={
                    filtersOpen
                      ? "bg-[#1E3A8A] text-white hover:bg-[#162D6B]"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filtros
                  {activeFilterCount > 0 && (
                    <span className="ml-2 rounded-full bg-white/20 px-1.5 py-0.5 text-xs">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>

                <Select
                  value={sortOption}
                  onValueChange={(value) =>
                    setSortOption(value as SortOption)
                  }
                >
                  <SelectTrigger className="h-10 w-[180px] border-slate-200 bg-white">
                    <ArrowUpDown className="mr-2 h-4 w-4 text-slate-400" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filtersOpen && (
              <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-3">
                <FilterSelect
                  label="Estado"
                  value={statusFilter}
                  onChange={(value) =>
                    setStatusFilter(value as "all" | ProjectStatus)
                  }
                  options={STATUS_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />

                <FilterSelect
                  label="Empresa"
                  value={companyFilter}
                  onChange={setCompanyFilter}
                  options={[
                    { value: "all", label: "Todas las empresas" },
                    ...companies.map(([id, name]) => ({
                      value: id,
                      label: name,
                    })),
                  ]}
                />

                <FilterSelect
                  label="Usuario / cliente"
                  value={userFilter}
                  onChange={setUserFilter}
                  options={[
                    { value: "all", label: "Todos los usuarios" },
                    ...users.map(([id, person]) => ({
                      value: id,
                      label: `${person.name}${
                        person.email ? ` · ${person.email}` : ""
                      }`,
                    })),
                  ]}
                />
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-500">
                Mostrando{" "}
                <strong className="text-slate-700">
                  {filteredProjects.length}
                </strong>{" "}
                de{" "}
                <strong className="text-slate-700">{projects.length}</strong>{" "}
                proyectos
              </span>

              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-[#1E3A8A] hover:bg-blue-50"
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Limpiar filtros
                </Button>
              )}
            </div>
          </div>
        </Card>

        {error && (
          <Card className="border border-red-200 bg-red-50 shadow-none">
            <div className="flex items-start gap-3 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
              <div className="flex-1">
                <p className="font-semibold text-red-800">
                  No se pudieron cargar los proyectos
                </p>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadProjects()}
                className="border-red-200 bg-white text-red-700"
              >
                Reintentar
              </Button>
            </div>
          </Card>
        )}

        {loading ? (
          <Card className="border border-slate-200 bg-white shadow-none">
            <div className="flex min-h-[360px] flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]" />
              <p className="mt-4 text-sm font-medium text-slate-600">
                Cargando proyectos...
              </p>
            </div>
          </Card>
        ) : filteredProjects.length === 0 ? (
          <Card className="border border-slate-200 bg-white shadow-none">
            <div className="flex min-h-[340px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <FolderKanban className="h-7 w-7 text-slate-400" />
              </div>
              <h2 className="mt-5 text-lg font-semibold text-slate-800">
                {projects.length ? "No se encontraron proyectos" : "No hay proyectos"}
              </h2>
              <p className="mt-1 max-w-md text-sm text-slate-500">
                {projects.length
                  ? "Cambia la búsqueda o alguno de los filtros."
                  : "Los proyectos disponibles para el área interna aparecerán aquí."}
              </p>
            </div>
          </Card>
        ) : (
          <Card className="overflow-hidden border border-slate-200 bg-white shadow-none">
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1080px]">
                <thead className="border-b border-slate-200 bg-slate-50/80">
                  <tr>
                    <TableHead>Proyecto</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Progreso</TableHead>
                    <TableHead>Próximo hito</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Fin</TableHead>
                    <th className="w-12 px-4 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProjects.map((project) => {
                    const progress = progressByProject[project.id];
                    const percentage = clamp(
                      Number(progress?.progress_percentage || 0),
                      0,
                      100
                    );
                    const nextMilestone = getNextMilestone(project.id);
                    const status = getProjectStatusMeta(project.estado);
                    const overdue =
                      Boolean(project.fecha_fin) &&
                      new Date(project.fecha_fin as string).getTime() < Date.now() &&
                      !["Entregado", "Completado"].includes(project.estado);

                    return (
                      <tr
                        key={project.id}
                        onClick={() => onOpenProject(project)}
                        className="group cursor-pointer transition-colors hover:bg-slate-50/70"
                      >
                        <td className="px-6 py-5">
                          <div className="flex max-w-[330px] items-start gap-3">
                            <ProjectIcon />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-800 group-hover:text-[#1E3A8A]">
                                {project.nombre}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {project.descripcion || "Sin descripción"}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-5">
                          <div className="flex max-w-[190px] items-center gap-2">
                            <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                            <span className="truncate text-sm text-slate-700">
                              {project.empresa_nombre || "Sin empresa"}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-5">
                          <div className="max-w-[210px]">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 shrink-0 text-slate-400" />
                              <span className="truncate text-sm font-medium text-slate-700">
                                {project.cliente_nombre || "Sin nombre"}
                              </span>
                            </div>
                            {project.cliente_email && (
                              <p className="ml-6 mt-1 truncate text-xs text-slate-400">
                                {project.cliente_email}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-5">
                          <ProgressCell
                            percentage={percentage}
                            completed={progress?.completed_milestones || 0}
                            total={progress?.total_milestones || 0}
                          />
                        </td>

                        <td className="px-4 py-5">
                          {nextMilestone ? (
                            <div className="max-w-[190px]">
                              <p className="truncate text-sm font-medium text-slate-700">
                                {nextMilestone.nombre}
                              </p>
                              <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {formatDate(nextMilestone.fecha_prevista)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">
                              Sin próximos hitos
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-5">
                          <StatusBadge status={status} />
                        </td>

                        <td className="px-4 py-5 text-right">
                          <span
                            className={
                              overdue
                                ? "text-sm font-semibold text-red-600"
                                : "text-sm text-slate-600"
                            }
                          >
                            {formatDate(project.fecha_fin)}
                          </span>
                          {overdue && (
                            <span className="mt-1 block text-[11px] font-medium text-red-500">
                              Retrasado
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-5 text-right">
                          <ChevronRight className="ml-auto h-4 w-4 text-slate-400 group-hover:text-[#1E3A8A]" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 lg:hidden">
              {filteredProjects.map((project) => {
                const progress = progressByProject[project.id];
                const percentage = clamp(
                  Number(progress?.progress_percentage || 0),
                  0,
                  100
                );
                const status = getProjectStatusMeta(project.estado);

                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onOpenProject(project)}
                    className="block w-full p-5 text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <ProjectIcon />
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-slate-800">
                            {project.nombre}
                          </h3>
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {project.empresa_nombre || "Sin empresa"}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                    </div>

                    <div className="mt-4">
                      <ProgressCell
                        percentage={percentage}
                        completed={progress?.completed_milestones || 0}
                        total={progress?.total_milestones || 0}
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <StatusBadge status={status} />
                      <span className="text-xs text-slate-500">
                        Fin: {formatDate(project.fecha_fin)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {showCreateProject && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeCreateProject();
            }}
          >
            <div className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1E3A8A]">
                    Operaciones
                  </p>
                  <h2
                    id="create-project-title"
                    className="mt-1 text-xl font-semibold tracking-tight text-slate-900"
                  >
                    Nuevo proyecto
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Crea el proyecto para un cliente existente y deja toda la
                    relación preparada para su seguimiento.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeCreateProject}
                  disabled={creatingProject}
                  className="shrink-0 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-5 px-6 py-6">
                {creationError && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <p className="text-sm leading-5 text-red-700">
                      {creationError}
                    </p>
                  </div>
                )}

                {loadingCreationOptions ? (
                  <div className="flex min-h-[260px] flex-col items-center justify-center">
                    <Loader2 className="h-7 w-7 animate-spin text-[#1E3A8A]" />
                    <p className="mt-3 text-sm text-slate-500">
                      Cargando clientes disponibles...
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-5 md:grid-cols-2">
                      <FormField label="Empresa">
                        <Select
                          value={creationForm.company_id || "all"}
                          onValueChange={(value) =>
                            setCreationForm((current) => ({
                              ...current,
                              company_id: value === "all" ? "" : value,
                              client_id: "",
                            }))
                          }
                          disabled={creatingProject}
                        >
                          <SelectTrigger className="h-10 border-slate-200 bg-white">
                            <SelectValue placeholder="Todas las empresas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">
                              Todas las empresas
                            </SelectItem>
                            {creationCompanies.map((company) => (
                              <SelectItem key={company.id} value={company.id}>
                                {company.company_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>

                      <FormField label="Cliente propietario">
                        <Select
                          value={creationForm.client_id}
                          onValueChange={(value) =>
                            setCreationForm((current) => ({
                              ...current,
                              client_id: value,
                            }))
                          }
                          disabled={creatingProject || !availableCreationClients.length}
                        >
                          <SelectTrigger className="h-10 border-slate-200 bg-white">
                            <SelectValue
                              placeholder={
                                availableCreationClients.length
                                  ? "Selecciona un cliente"
                                  : "No hay clientes disponibles"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {availableCreationClients.map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                <span>
                                  {client.nombre || "Cliente sin nombre"}
                                  {client.email ? ` · ${client.email}` : ""}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormField>
                    </div>

                    {creationForm.client_id && (
                      <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-slate-500">
                        <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                        <span>
                          Empresa asignada:{" "}
                          <strong className="font-semibold text-slate-700">
                            {creationClients.find(
                              (client) => client.id === creationForm.client_id
                            )?.empresa ||
                              creationCompanies.find(
                                (company) =>
                                  company.id ===
                                  creationClients.find(
                                    (client) =>
                                      client.id === creationForm.client_id
                                  )?.company_id
                              )?.company_name ||
                              "Sin nombre"}
                          </strong>
                        </span>
                      </div>
                    )}

                    <FormField label="Nombre del proyecto">
                      <Input
                        value={creationForm.nombre}
                        onChange={(event) =>
                          setCreationForm((current) => ({
                            ...current,
                            nombre: event.target.value,
                          }))
                        }
                        maxLength={200}
                        placeholder="Ej. Automatización de facturación"
                        disabled={creatingProject}
                        autoFocus
                        className="h-10 border-slate-200 bg-white focus-visible:ring-[#1E3A8A]"
                      />
                    </FormField>

                    <FormField label="Descripción">
                      <Textarea
                        value={creationForm.descripcion}
                        onChange={(event) =>
                          setCreationForm((current) => ({
                            ...current,
                            descripcion: event.target.value,
                          }))
                        }
                        maxLength={5000}
                        rows={5}
                        placeholder="Describe el objetivo, alcance o contexto operativo del proyecto..."
                        disabled={creatingProject}
                        className="border-slate-200 bg-white focus-visible:ring-[#1E3A8A]"
                      />
                    </FormField>

                    <div className="grid gap-5 md:grid-cols-2">
                      <FormField label="Fecha de inicio">
                        <Input
                          type="date"
                          value={creationForm.fecha_inicio}
                          onChange={(event) =>
                            setCreationForm((current) => ({
                              ...current,
                              fecha_inicio: event.target.value,
                            }))
                          }
                          disabled={creatingProject}
                          className="h-10 border-slate-200 bg-white focus-visible:ring-[#1E3A8A]"
                        />
                      </FormField>

                      <FormField label="Fecha de fin">
                        <Input
                          type="date"
                          value={creationForm.fecha_fin}
                          min={creationForm.fecha_inicio || undefined}
                          onChange={(event) =>
                            setCreationForm((current) => ({
                              ...current,
                              fecha_fin: event.target.value,
                            }))
                          }
                          disabled={creatingProject}
                          className="h-10 border-slate-200 bg-white focus-visible:ring-[#1E3A8A]"
                        />
                      </FormField>
                    </div>
                  </>
                )}
              </div>

              {!loadingCreationOptions && (
                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeCreateProject}
                    disabled={creatingProject}
                    className="border-slate-200 bg-white text-slate-700"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    onClick={handleCreateProject}
                    disabled={
                      creatingProject ||
                      loadingCreationOptions ||
                      !creationForm.client_id
                    }
                    className="bg-[#1E3A8A] text-white hover:bg-[#162D6B]"
                  >
                    {creatingProject ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Crear proyecto
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   DETALLE / FICHA 360º
   ========================================================================== */

function EmployeeProjectDetail({
  projectId,
  onBack,
  onNavigate,
  onOpenMenu,
}: {
  projectId: string;
  onBack: () => void;
  onNavigate: (path: string) => void;
  onOpenMenu: () => void;
}) {
  const { user } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [changeRequests, setChangeRequests] = useState<ProjectChangeRequest[]>([]);
  const [billing, setBilling] = useState<RelatedBilling[]>([]);
  const [quotations, setQuotations] = useState<RelatedQuotation[]>([]);
  const [tickets, setTickets] = useState<RelatedTicket[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [updatingProject, setUpdatingProject] = useState(false);

  const [creatingMilestone, setCreatingMilestone] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({
    nombre: "",
    descripcion: "",
    fecha_prevista: "",
  });

  const [milestoneUpdatingId, setMilestoneUpdatingId] = useState<string | null>(
    null
  );
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(
  null
);

const [deletingMilestoneId, setDeletingMilestoneId] = useState<string | null>(
  null
);

const [editingMilestoneForm, setEditingMilestoneForm] = useState({
  nombre: "",
  descripcion: "",
  fecha_prevista: "",
  orden: "",
  estado: "pendiente" as MilestoneStatus,
});
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

const [publishingUpdate, setPublishingUpdate] = useState(false);

const [updateForm, setUpdateForm] = useState({
  titulo: "",
  contenido: "",
});

const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);

const [deletingUpdateId, setDeletingUpdateId] = useState<string | null>(null);

const [editingUpdateForm, setEditingUpdateForm] = useState({
  titulo: "",
  contenido: "",
});

  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(
    null
  );
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const [activeSection, setActiveSection] = useState<
    "resumen" | "hitos" | "actualizaciones" | "documentos" | "finanzas" | "soporte" | "actividad"
  >("resumen");

  const loadProject = useCallback(
    async (silent = false) => {
      if (!user || !projectId) return;

      try {
        if (silent) setRefreshing(true);
        else setLoading(true);

        setError(null);

        const { data: projectsData, error: projectsError } =
          await supabase.rpc("get_worker_projects");

        if (projectsError) throw projectsError;

        const foundProject = (projectsData || []).find(
          (item: Project) => item.id === projectId
        ) as Project | undefined;

        if (!foundProject) {
          throw new Error("Proyecto no encontrado o no disponible.");
        }

        setProject(foundProject);
        setNameDraft(foundProject.nombre);

        const [
          milestonesResult,
          progressResult,
          documentsResult,
          updatesResult,
          changeRequestsResult,
          billingResult,
          quotationsResult,
          ticketsResult,
        ] = await Promise.all([
          supabase
            .from("project_milestones")
            .select(
              "id, project_id, nombre, descripcion, fecha_prevista, orden, estado, completed_at, created_by, created_at, updated_at"
            )
            .eq("project_id", projectId)
            .order("orden", { ascending: true })
            .order("fecha_prevista", { ascending: true }),

          supabase
            .from("project_progress")
            .select(
              "project_id, total_milestones, completed_milestones, progress_percentage"
            )
            .eq("project_id", projectId)
            .maybeSingle(),

          supabase
            .from("project_documents")
            .select(
              "id, project_id, file_name, storage_path, mime_type, file_size, uploaded_by, created_at, updated_at"
            )
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),

          supabase
            .from("project_updates")
            .select(
              "id, project_id, titulo, contenido, created_by, created_at, updated_at"
            )
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),

          supabase
            .from("project_change_requests")
            .select(
              "id, project_id, user_id, company_id, client_id, description, status, requested_at, created_at, reviewed_by, reviewed_at, review_notes"
            )
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),

          supabase
            .from("billing")
            .select(
              "id, numero_factura, estado, monto, importe_a_pagar, fecha_vencimiento"
            )
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),

          supabase
            .from("quotations")
            .select(
              "id, numero_presupuesto, titulo, estado, precio_total"
            )
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),

          supabase
            .from("support_tickets")
            .select("id, asunto, estado, prioridad, created_at")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),
        ]);

        if (milestonesResult.error) throw milestonesResult.error;

        const resolvedMilestones = (milestonesResult.data ||
          []) as ProjectMilestone[];

        setMilestones(resolvedMilestones);

        let resolvedProgress = progressResult.error
          ? null
          : ((progressResult.data || null) as ProjectProgress | null);

        if (!resolvedProgress) {
          const total = resolvedMilestones.length;
          const completed = resolvedMilestones.filter(
            (item) => item.estado === "completado"
          ).length;

          resolvedProgress = {
            project_id: projectId,
            total_milestones: total,
            completed_milestones: completed,
            progress_percentage: total
              ? Math.round((completed / total) * 100)
              : 0,
          };
        }

        setProgress(resolvedProgress);

        setDocuments(
          documentsResult.error
            ? []
            : ((documentsResult.data || []) as ProjectDocument[])
        );

        setUpdates(
          updatesResult.error
            ? []
            : ((updatesResult.data || []) as ProjectUpdate[])
        );

        // The worker RPC is the authoritative way to retrieve all change requests.
        // Filter locally because the RPC returns the worker-visible collection.
        if (!changeRequestsResult.error) {
          setChangeRequests(
            (changeRequestsResult.data || []) as ProjectChangeRequest[]
          );
        } else {
          const { data: workerRequests } = await supabase.rpc(
            "get_worker_project_change_requests"
          );

          setChangeRequests(
            ((workerRequests || []) as ProjectChangeRequest[]).filter(
              (request) => request.project_id === projectId
            )
          );
        }

        setBilling(
          billingResult.error
            ? []
            : ((billingResult.data || []) as RelatedBilling[])
        );

        setQuotations(
          quotationsResult.error
            ? []
            : ((quotationsResult.data || []) as RelatedQuotation[])
        );

        setTickets(
          ticketsResult.error
            ? []
            : ((ticketsResult.data || []) as RelatedTicket[])
        );
      } catch (err: any) {
        console.error("[EmployeeProjectDetail] Error:", err);
        setError(err?.message || "No se pudo cargar el proyecto.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, projectId]
  );

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const updateProjectStatus = async (status: ProjectStatus) => {
    if (!project) return;

    try {
      setUpdatingProject(true);

      const { data, error: rpcError } = await supabase.rpc(
        "update_project_by_worker",
        {
          p_project_id: project.id,
          p_nombre: null,
          p_estado: status,
        }
      );

      if (rpcError) throw rpcError;

      if (!data) throw new Error("No se recibió el proyecto actualizado.");

      setProject((current) =>
        current
          ? { ...current, estado: status }
          : current
      );

      toast.success("Estado del proyecto actualizado.");
    } catch (err: any) {
      console.error("[EmployeeProjectDetail] Status error:", err);
      toast.error(err?.message || "No se pudo actualizar el estado.");
    } finally {
      setUpdatingProject(false);
    }
  };

  const saveProjectName = async () => {
    if (!project) return;

    const value = nameDraft.trim();

    if (!value) {
      toast.error("El nombre del proyecto no puede estar vacío.");
      return;
    }

    try {
      setUpdatingProject(true);

      const { data, error: rpcError } = await supabase.rpc(
        "update_project_by_worker",
        {
          p_project_id: project.id,
          p_nombre: value,
          p_estado: null,
        }
      );

      if (rpcError) throw rpcError;
      if (!data) throw new Error("No se recibió el proyecto actualizado.");

      setProject((current) =>
        current
          ? { ...current, nombre: value }
          : current
      );

      setEditingName(false);
      toast.success("Nombre del proyecto actualizado.");
    } catch (err: any) {
      console.error("[EmployeeProjectDetail] Name error:", err);
      toast.error(err?.message || "No se pudo actualizar el nombre.");
    } finally {
      setUpdatingProject(false);
    }
  };

  const startEditingMilestone = (milestone: ProjectMilestone) => {
  const date = new Date(milestone.fecha_prevista);

  const timezoneOffset = date.getTimezoneOffset();
  const localDate = new Date(
    date.getTime() - timezoneOffset * 60 * 1000
  );

  setEditingMilestoneId(milestone.id);

  setEditingMilestoneForm({
    nombre: milestone.nombre,
    descripcion: milestone.descripcion || "",
    fecha_prevista: localDate.toISOString().slice(0, 16),
    orden: String(milestone.orden),
    estado: milestone.estado,
  });
};
const saveMilestone = async () => {
  if (!editingMilestoneId) return;

  if (!editingMilestoneForm.nombre.trim()) {
    toast.error("El nombre del hito es obligatorio.");
    return;
  }

  if (!editingMilestoneForm.fecha_prevista) {
    toast.error("La fecha prevista es obligatoria.");
    return;
  }

  const orden = Number(editingMilestoneForm.orden);

  if (!Number.isInteger(orden) || orden < 1) {
    toast.error("El orden del hito no es válido.");
    return;
  }

  try {
    setMilestoneUpdatingId(editingMilestoneId);

    const { error: rpcError } = await supabase.rpc(
      "update_project_milestone",
      {
        p_milestone_id: editingMilestoneId,
        p_nombre: editingMilestoneForm.nombre.trim(),
        p_descripcion:
          editingMilestoneForm.descripcion.trim() || null,
        p_fecha_prevista: new Date(
          editingMilestoneForm.fecha_prevista
        ).toISOString(),
        p_orden: orden,
        p_estado: editingMilestoneForm.estado,
      }
    );

    if (rpcError) throw rpcError;

    setEditingMilestoneId(null);

    await loadProject(true);

    toast.success("Hito actualizado correctamente.");
  } catch (err: any) {
    console.error(
      "[EmployeeProjectDetail] Milestone update error:",
      err
    );

    toast.error(
      err?.message || "No se pudo actualizar el hito."
    );
  } finally {
    setMilestoneUpdatingId(null);
  }
};

const deleteMilestone = async (milestone: ProjectMilestone) => {
  const confirmed = window.confirm(
    `¿Seguro que quieres eliminar el hito "${milestone.nombre}"?`
  );

  if (!confirmed) return;

  try {
    setDeletingMilestoneId(milestone.id);

    const { error: rpcError } = await supabase.rpc(
      "delete_project_milestone",
      {
        p_milestone_id: milestone.id,
      }
    );

    if (rpcError) throw rpcError;

    await loadProject(true);

    toast.success("Hito eliminado correctamente.");
  } catch (err: any) {
    console.error(
      "[EmployeeProjectDetail] Milestone delete error:",
      err
    );

    toast.error(
      err?.message || "No se pudo eliminar el hito."
    );
  } finally {
    setDeletingMilestoneId(null);
  }
};
  const createMilestone = async () => {
    if (!project) return;

    if (!milestoneForm.nombre.trim()) {
      toast.error("Escribe el nombre del hito.");
      return;
    }

    if (!milestoneForm.fecha_prevista) {
      toast.error("Selecciona una fecha prevista.");
      return;
    }

    try {
      setCreatingMilestone(true);

      const { error: rpcError } = await supabase.rpc(
        "create_project_milestone",
        {
          p_project_id: project.id,
          p_nombre: milestoneForm.nombre.trim(),
          p_descripcion: milestoneForm.descripcion.trim() || null,
          p_fecha_prevista: new Date(
            milestoneForm.fecha_prevista
          ).toISOString(),
        }
      );

      if (rpcError) throw rpcError;

      setMilestoneForm({
        nombre: "",
        descripcion: "",
        fecha_prevista: "",
      });

      await loadProject(true);
      toast.success("Hito creado correctamente.");
    } catch (err: any) {
      console.error("[EmployeeProjectDetail] Milestone create error:", err);
      toast.error(err?.message || "No se pudo crear el hito.");
    } finally {
      setCreatingMilestone(false);
    }
  };

  const setMilestoneStatus = async (
    milestoneId: string,
    estado: MilestoneStatus
  ) => {
    try {
      setMilestoneUpdatingId(milestoneId);

      const { error: rpcError } = await supabase.rpc(
        "set_project_milestone_status",
        {
          p_milestone_id: milestoneId,
          p_estado: estado,
        }
      );

      if (rpcError) throw rpcError;

      await loadProject(true);
      toast.success("Estado del hito actualizado.");
    } catch (err: any) {
      console.error("[EmployeeProjectDetail] Milestone status error:", err);
      toast.error(err?.message || "No se pudo actualizar el hito.");
    } finally {
      setMilestoneUpdatingId(null);
    }
  };

  const uploadDocument = async (file: File) => {
    if (!project) return;

    if (file.type !== "application/pdf") {
      toast.error("Solo se permiten documentos PDF.");
      return;
    }

    if (file.size <= 0) {
      toast.error("El documento está vacío.");
      return;
    }

    try {
      setUploading(true);

      const documentId = crypto.randomUUID();
      const storagePath = `${project.id}/${documentId}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("project-documents")
        .upload(storagePath, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: attachError } = await supabase.rpc(
        "attach_project_document",
        {
          p_project_id: project.id,
          p_document_id: documentId,
          p_file_name: file.name,
          p_file_size: file.size,
        }
      );

      if (attachError) {
        // Best-effort cleanup of the physical object if metadata registration fails.
        await supabase.storage
          .from("project-documents")
          .remove([storagePath]);

        throw attachError;
      }

      await loadProject(true);
      toast.success("Documento adjuntado al proyecto.");
    } catch (err: any) {
      console.error("[EmployeeProjectDetail] Upload error:", err);
      toast.error(err?.message || "No se pudo adjuntar el documento.");
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const openDocument = async (document: ProjectDocument) => {
    try {
      const { data, error: signedUrlError } = await supabase.storage
        .from("project-documents")
        .createSignedUrl(document.storage_path, 600);

      if (signedUrlError) throw signedUrlError;

      if (!data?.signedUrl) {
        throw new Error("No se pudo generar el acceso al documento.");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      console.error("[EmployeeProjectDetail] Document open error:", err);
      toast.error(err?.message || "No se pudo abrir el documento.");
    }
  };

  const deleteDocument = async (document: ProjectDocument) => {
    const confirmed = window.confirm(
      `¿Eliminar "${document.file_name}" del proyecto?`
    );

    if (!confirmed) return;

    try {
      const { error: storageError } = await supabase.storage
        .from("project-documents")
        .remove([document.storage_path]);

      if (storageError) {
        console.warn(
          "[EmployeeProjectDetail] Storage delete warning:",
          storageError
        );
      }

      const { error: detachError } = await supabase.rpc(
        "detach_project_document",
        {
          p_document_id: document.id,
        }
      );

      if (detachError) throw detachError;

      await loadProject(true);
      toast.success("Documento eliminado.");
    } catch (err: any) {
      console.error("[EmployeeProjectDetail] Document delete error:", err);
      toast.error(err?.message || "No se pudo eliminar el documento.");
    }
  };

  const publishUpdate = async () => {
    if (!project) return;

    const title = updateForm.titulo.trim();
    const content = updateForm.contenido.trim();

    if (!title) {
      toast.error("Escribe un título para la actualización.");
      return;
    }

    if (!content) {
      toast.error("Escribe el contenido de la actualización.");
      return;
    }

    try {
      setPublishingUpdate(true);

      /*
       * project_updates no tiene INSERT directo para authenticated.
       * La migración 041 exige create_project_update(), que además
       * valida que el usuario sea worker activo y genera la notificación
       * del cliente del proyecto.
       */
      const { error: rpcError } = await supabase.rpc(
        "create_project_update",
        {
          p_project_id: project.id,
          p_titulo: title,
          p_contenido: content,
        }
      );

      if (rpcError) throw rpcError;

      setUpdateForm({ titulo: "", contenido: "" });
      await loadProject(true);

      toast.success(
        "Actualización publicada. El sistema de notificaciones procesará la comunicación al cliente."
      );
    } catch (err: any) {
      console.error("[EmployeeProjectDetail] Update publish error:", err);
      toast.error(
        err?.message || "No se pudo publicar la actualización."
      );
    } finally {
      setPublishingUpdate(false);
    }
  };
const startEditingUpdate = (update: ProjectUpdate) => {
  setEditingUpdateId(update.id);

  setEditingUpdateForm({
    titulo: update.titulo,
    contenido: update.contenido,
  });
};

const saveUpdate = async () => {
  if (!editingUpdateId) return;

  const title = editingUpdateForm.titulo.trim();
  const content = editingUpdateForm.contenido.trim();

  if (!title) {
    toast.error("Escribe un título para la actualización.");
    return;
  }

  if (!content) {
    toast.error("Escribe el contenido de la actualización.");
    return;
  }

  try {
    setPublishingUpdate(true);

    const { error: rpcError } = await supabase.rpc(
      "update_project_update",
      {
        p_update_id: editingUpdateId,
        p_titulo: title,
        p_contenido: content,
      }
    );

    if (rpcError) throw rpcError;

    setEditingUpdateId(null);

    setEditingUpdateForm({
      titulo: "",
      contenido: "",
    });

    await loadProject(true);

    toast.success("Actualización modificada correctamente.");
  } catch (err: any) {
    console.error(
      "[EmployeeProjectDetail] Update edit error:",
      err
    );

    toast.error(
      err?.message || "No se pudo modificar la actualización."
    );
  } finally {
    setPublishingUpdate(false);
  }
};

const deleteUpdate = async (update: ProjectUpdate) => {
  const confirmed = window.confirm(
    `¿Seguro que quieres eliminar la actualización "${update.titulo}"?`
  );

  if (!confirmed) return;

  try {
    setDeletingUpdateId(update.id);

    const { error: rpcError } = await supabase.rpc(
      "delete_project_update",
      {
        p_update_id: update.id,
      }
    );

    if (rpcError) throw rpcError;

    await loadProject(true);

    toast.success("Actualización eliminada correctamente.");
  } catch (err: any) {
    console.error(
      "[EmployeeProjectDetail] Update delete error:",
      err
    );

    toast.error(
      err?.message || "No se pudo eliminar la actualización."
    );
  } finally {
    setDeletingUpdateId(null);
  }
};
  const resolveChangeRequest = async (
    request: ProjectChangeRequest,
    action: "in_review" | "accepted" | "rejected" | "completed"
  ) => {
    try {
      setResolvingRequestId(request.id);

      const { error: rpcError } = await supabase.rpc(
        "resolve_project_change_request",
        {
          p_request_id: request.id,
          p_action: action,
          p_review_notes: reviewNotes[request.id]?.trim() || null,
        }
      );

      if (rpcError) throw rpcError;

      await loadProject(true);
      toast.success("Solicitud de cambio actualizada.");
    } catch (err: any) {
      console.error("[EmployeeProjectDetail] Change request error:", err);
      toast.error(
        err?.message || "No se pudo actualizar la solicitud."
      );
    } finally {
      setResolvingRequestId(null);
    }
  };

  const sections = [
    { id: "resumen" as const, label: "Resumen" },
    { id: "hitos" as const, label: `Hitos${milestones.length ? ` · ${milestones.length}` : ""}` },
    {
      id: "actualizaciones" as const,
      label: `Actualizaciones${updates.length ? ` · ${updates.length}` : ""}`,
    },
    {
      id: "documentos" as const,
      label: `Documentos${documents.length ? ` · ${documents.length}` : ""}`,
    },
    { id: "finanzas" as const, label: "Finanzas" },
    {
      id: "soporte" as const,
      label: `Soporte${tickets.length ? ` · ${tickets.length}` : ""}`,
    },
    { id: "actividad" as const, label: "Actividad" },
  ];

  if (loading) {
    return (
      <div className="min-h-full bg-[#F8FAFC] p-6 lg:p-8">
        <div className="mx-auto flex min-h-[500px] max-w-[1500px] flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]" />
          <p className="mt-4 text-sm font-medium text-slate-600">
            Cargando proyecto...
          </p>
        </div>
      </div>
    );
  }

  if (!project || error) {
    return (
      <div className="min-h-full bg-[#F8FAFC] p-6 lg:p-8">
        <div className="mx-auto max-w-[1500px]">
          <Button
            variant="ghost"
            onClick={onBack}
            className="mb-5 text-slate-600"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a proyectos
          </Button>

          <Card className="border border-red-200 bg-white p-8 shadow-none">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <h2 className="font-semibold text-slate-800">
                  No se pudo abrir el proyecto
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {error || "Proyecto no encontrado."}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  const percentage = clamp(
    Number(progress?.progress_percentage || 0),
    0,
    100
  );

  const nextMilestone =
    milestones
      .filter((item) => item.estado !== "completado")
      .sort(
        (a, b) =>
          new Date(a.fecha_prevista).getTime() -
          new Date(b.fecha_prevista).getTime()
      )[0] || null;

  const pendingChangeRequests = changeRequests.filter((request) =>
    ["pending", "in_review", "accepted"].includes(request.status)
  ).length;

  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
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
            <p className="text-sm font-semibold text-[#263044]">Proyectos</p>
            <p className="text-xs text-[#939CAA]">Ficha 360º del proyecto</p>
          </div>
        </div>

        {/* Header */}
        <div>
          <Button
            variant="ghost"
            onClick={onBack}
            className="-ml-2 mb-4 text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a proyectos
          </Button>

          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-4">
                <ProjectIcon large />

                <div className="min-w-0 flex-1">
                  {editingName ? (
                    <div className="flex max-w-3xl flex-col gap-2 sm:flex-row">
                      <Input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        autoFocus
                        className="h-11 border-slate-200 bg-white text-lg font-semibold focus-visible:ring-[#1E3A8A]"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={saveProjectName}
                          disabled={updatingProject}
                          className="bg-[#1E3A8A] hover:bg-[#162D6B]"
                        >
                          {updatingProject ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setNameDraft(project.nombre);
                            setEditingName(false);
                          }}
                          disabled={updatingProject}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        {project.nombre}
                      </h1>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingName(true)}
                        className="h-8 w-8 text-slate-400 hover:bg-blue-50 hover:text-[#1E3A8A]"
                        title="Editar nombre"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="h-4 w-4" />
                      {project.empresa_nombre || "Sin empresa"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <User className="h-4 w-4" />
                      {project.cliente_nombre || "Sin usuario"}
                    </span>
                    {project.cliente_email && (
                      <span className="hidden text-slate-400 md:inline">
                        {project.cliente_email}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={project.estado}
                onValueChange={(value) =>
                  updateProjectStatus(value as ProjectStatus)
                }
                disabled={updatingProject}
              >
                <SelectTrigger className="h-10 w-[165px] border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.filter((option) => option.value !== "all").map(
                    (option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() => loadProject(true)}
                disabled={refreshing}
                className="border-slate-200 bg-white"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Hero summary */}
        <Card className="border border-slate-200 bg-white shadow-none">
          <div className="grid gap-0 lg:grid-cols-[1.3fr_.7fr_.7fr_.7fr]">
            <div className="p-6 lg:border-r lg:border-slate-100">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Progreso del proyecto
                  </p>
                  <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
                    {percentage}%
                  </p>
                </div>

                <div className="hidden h-20 w-20 items-center justify-center rounded-full border-[8px] border-slate-100 sm:flex">
                  <span className="text-sm font-bold text-[#1E3A8A]">
                    {percentage}%
                  </span>
                </div>
              </div>

              <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#1E3A8A]"
                  style={{ width: `${percentage}%` }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>
                  {progress?.completed_milestones || 0} de{" "}
                  {progress?.total_milestones || 0} hitos completados
                </span>
                {nextMilestone && (
                  <span className="hidden sm:inline">
                    Próximo: {nextMilestone.nombre}
                  </span>
                )}
              </div>
            </div>

            <MetricBlock
              icon={<CalendarDays className="h-5 w-5" />}
              label="Inicio"
              value={formatDate(project.fecha_inicio)}
            />

            <MetricBlock
              icon={<Clock3 className="h-5 w-5" />}
              label="Fecha fin"
              value={formatDate(project.fecha_fin)}
              danger={
                Boolean(project.fecha_fin) &&
                new Date(project.fecha_fin as string).getTime() < Date.now() &&
                !["Entregado", "Completado"].includes(project.estado)
              }
            />

            <MetricBlock
              icon={<BellRing className="h-5 w-5" />}
              label="Solicitudes abiertas"
              value={pendingChangeRequests}
              detail={
                pendingChangeRequests
                  ? "Requieren seguimiento"
                  : "Sin solicitudes pendientes"
              }
            />
          </div>
        </Card>

        {/* Navigation */}
        <div className="sticky top-0 z-10 -mx-1 overflow-x-auto bg-[#F8FAFC]/95 px-1 py-1 backdrop-blur">
          <div className="flex min-w-max gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-none">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={[
                  "rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                  activeSection === section.id
                    ? "bg-[#1E3A8A] text-white shadow-none"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                ].join(" ")}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <Card className="border border-red-200 bg-red-50 p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </Card>
        )}

        {/* ============================ RESUMEN ============================ */}
        {activeSection === "resumen" && (
          <div className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
            <div className="space-y-6">
              <Card className="border border-slate-200 bg-white shadow-none">
                <SectionHeader
                  icon={<FolderKanban className="h-5 w-5" />}
                  title="Información del proyecto"
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingName(true)}
                      className="text-[#1E3A8A]"
                    >
                      <Pencil className="mr-1.5 h-4 w-4" />
                      Editar
                    </Button>
                  }
                />

                <div className="grid gap-5 p-6 md:grid-cols-2">
                  <InfoField label="Descripción">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {project.descripcion || "Sin descripción."}
                    </p>
                  </InfoField>

                  <InfoField label="Estado">
                    <StatusBadge
                      status={getProjectStatusMeta(project.estado)}
                    />
                  </InfoField>

                  <InfoField label="Empresa">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      {project.empresa_nombre || "Sin empresa"}
                    </div>
                  </InfoField>

                  <InfoField label="Usuario / cliente">
                    <div className="text-sm font-medium text-slate-700">
                      {project.cliente_nombre || "Sin nombre"}
                      {project.cliente_email && (
                        <span className="mt-1 block text-xs font-normal text-slate-400">
                          {project.cliente_email}
                        </span>
                      )}
                    </div>
                  </InfoField>

                  <InfoField label="Fecha de inicio">
                    <p className="text-sm text-slate-700">
                      {formatDate(project.fecha_inicio)}
                    </p>
                  </InfoField>

                  <InfoField label="Fecha de fin">
                    <p className="text-sm text-slate-700">
                      {formatDate(project.fecha_fin)}
                    </p>
                  </InfoField>
                </div>
              </Card>

              <Card className="border border-slate-200 bg-white shadow-none">
                <SectionHeader
                  icon={<CircleDot className="h-5 w-5" />}
                  title="Próximos hitos"
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveSection("hitos")}
                      className="text-[#1E3A8A]"
                    >
                      Ver todos
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  }
                />

                <div className="divide-y divide-slate-100">
                  {milestones
                    .filter((item) => item.estado !== "completado")
                    .slice(0, 4)
                    .map((milestone) => (
                      <MilestoneCompact
                        key={milestone.id}
                        milestone={milestone}
                      />
                    ))}

                  {!milestones.some(
                    (item) => item.estado !== "completado"
                  ) && (
                    <EmptyInline
                      icon={<CheckCircle2 className="h-5 w-5" />}
                      text="No hay hitos pendientes."
                    />
                  )}
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="border border-slate-200 bg-white shadow-none">
                <SectionHeader
                  icon={<AlertCircle className="h-5 w-5" />}
                  title="Atención"
                />

                <div className="space-y-3 p-5">
                  <AttentionRow
                    label="Solicitudes de cambio"
                    value={pendingChangeRequests}
                    tone={pendingChangeRequests ? "warning" : "neutral"}
                    onClick={() => setActiveSection("resumen")}
                  />
                  <AttentionRow
                    label="Documentos"
                    value={documents.length}
                    tone="neutral"
                    onClick={() => setActiveSection("documentos")}
                  />
                  <AttentionRow
                    label="Tickets"
                    value={tickets.filter(
                      (ticket) =>
                        !["cerrado", "resuelto"].includes(
                          String(ticket.estado || "").toLowerCase()
                        )
                    ).length}
                    tone="neutral"
                    onClick={() => setActiveSection("soporte")}
                  />
                  <AttentionRow
                    label="Facturas"
                    value={billing.length}
                    tone="neutral"
                    onClick={() => setActiveSection("finanzas")}
                  />
                </div>
              </Card>

              <Card className="border border-slate-200 bg-white shadow-none">
                <SectionHeader
                  icon={<MessageSquare className="h-5 w-5" />}
                  title="Última actualización"
                />

                <div className="p-5">
                  {updates[0] ? (
                    <>
                      <p className="font-semibold text-slate-800">
                        {updates[0].titulo}
                      </p>
                      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-500">
                        {updates[0].contenido}
                      </p>
                      <p className="mt-4 text-xs text-slate-400">
                        {formatDateTime(updates[0].created_at)}
                      </p>
                    </>
                  ) : (
                    <EmptyInline
                      icon={<MessageSquare className="h-5 w-5" />}
                      text="Todavía no hay actualizaciones."
                    />
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ============================ HITOS ============================ */}
{activeSection === "hitos" && (
  <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
    <Card className="border border-slate-200 bg-white shadow-none">
      <SectionHeader
        icon={<CircleDot className="h-5 w-5" />}
        title="Hitos del proyecto"
        description="El progreso se calcula a partir de estos hitos."
      />

      <div className="divide-y divide-slate-100">
        {milestones.map((milestone, index) => (
          <div key={milestone.id} className="p-5 lg:p-6">
            {editingMilestoneId === milestone.id ? (
              /* =====================================================
                 MODO EDICIÓN
              ===================================================== */
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div
                    className={[
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                      milestone.estado === "completado"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                        : milestone.estado === "en_curso"
                          ? "border-blue-200 bg-blue-50 text-[#1E3A8A]"
                          : "border-slate-200 bg-slate-50 text-slate-400",
                    ].join(" ")}
                  >
                    {milestone.estado === "completado" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <span className="text-xs font-semibold">
                        {index + 1}
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Editar hito
                    </p>
                    <p className="text-xs text-slate-400">
                      Modifica los datos de esta etapa del proyecto.
                    </p>
                  </div>
                </div>

                {/* Nombre */}
                <FormField label="Nombre">
                  <Input
                    value={editingMilestoneForm.nombre}
                    onChange={(e) =>
                      setEditingMilestoneForm((current) => ({
                        ...current,
                        nombre: e.target.value,
                      }))
                    }
                    placeholder="Ej. Diseño aprobado"
                  />
                </FormField>

                {/* Descripción */}
                <FormField label="Descripción">
                  <Textarea
                    value={editingMilestoneForm.descripcion}
                    onChange={(e) =>
                      setEditingMilestoneForm((current) => ({
                        ...current,
                        descripcion: e.target.value,
                      }))
                    }
                    placeholder="Describe el objetivo del hito..."
                    rows={4}
                  />
                </FormField>

                {/* Fecha + Orden */}
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField label="Fecha prevista">
                    <Input
                      type="datetime-local"
                      value={editingMilestoneForm.fecha_prevista}
                      onChange={(e) =>
                        setEditingMilestoneForm((current) => ({
                          ...current,
                          fecha_prevista: e.target.value,
                        }))
                      }
                    />
                  </FormField>

                  <FormField label="Orden">
                    <Input
                      type="number"
                      min={1}
                      value={editingMilestoneForm.orden}
                      onChange={(e) =>
                        setEditingMilestoneForm((current) => ({
                          ...current,
                          orden: e.target.value,
                        }))
                      }
                    />
                  </FormField>
                </div>

                {/* Estado */}
                <FormField label="Estado">
                  <Select
                    value={editingMilestoneForm.estado}
                    onValueChange={(value) =>
                      setEditingMilestoneForm((current) => ({
                        ...current,
                        estado: value as MilestoneStatus,
                      }))
                    }
                  >
                    <SelectTrigger className="border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>

                    <SelectContent>
                      <SelectItem value="pendiente">
                        Pendiente
                      </SelectItem>

                      <SelectItem value="en_curso">
                        En curso
                      </SelectItem>

                      <SelectItem value="completado">
                        Completado
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>

                {/* Botones */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditingMilestoneId(null)}
                    disabled={milestoneUpdatingId === milestone.id}
                  >
                    Cancelar
                  </Button>

                  <Button
                    type="button"
                    onClick={saveMilestone}
                    disabled={milestoneUpdatingId === milestone.id}
                    className="bg-[#1E3A8A] hover:bg-[#162D6B]"
                  >
                    {milestoneUpdatingId === milestone.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}

                    Guardar cambios
                  </Button>
                </div>
              </div>
            ) : (
              /* =====================================================
                 MODO NORMAL
              ===================================================== */
              <div className="flex items-start gap-4">
                {/* Número / estado */}
                <div
                  className={[
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                    milestone.estado === "completado"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                      : milestone.estado === "en_curso"
                        ? "border-blue-200 bg-blue-50 text-[#1E3A8A]"
                        : "border-slate-200 bg-slate-50 text-slate-400",
                  ].join(" ")}
                >
                  {milestone.estado === "completado" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-semibold">
                      {index + 1}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    {/* Información del hito */}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-800">
                        {milestone.nombre}
                      </h3>

                      {milestone.descripcion && (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-500">
                          {milestone.descripcion}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {formatDate(milestone.fecha_prevista)}
                        </span>

                        {milestone.completed_at && (
                          <span>
                            Completado{" "}
                            {formatDateTime(milestone.completed_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex shrink-0 items-center gap-2">
                      {/* Estado */}
                      <Select
                        value={milestone.estado}
                        onValueChange={(value) =>
                          setMilestoneStatus(
                            milestone.id,
                            value as MilestoneStatus
                          )
                        }
                        disabled={
                          milestoneUpdatingId === milestone.id ||
                          deletingMilestoneId === milestone.id
                        }
                      >
                        <SelectTrigger className="h-9 w-[145px] border-slate-200 bg-white">
                          {milestoneUpdatingId === milestone.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <SelectValue />
                          )}
                        </SelectTrigger>

                        <SelectContent>
                          <SelectItem value="pendiente">
                            Pendiente
                          </SelectItem>

                          <SelectItem value="en_curso">
                            En curso
                          </SelectItem>

                          <SelectItem value="completado">
                            Completado
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {/* Editar */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-slate-500 hover:bg-slate-100 hover:text-[#1E3A8A]"
                        onClick={() => startEditingMilestone(milestone)}
                        disabled={
                          milestoneUpdatingId === milestone.id ||
                          deletingMilestoneId === milestone.id
                        }
                        title="Editar hito"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      {/* Eliminar */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => deleteMilestone(milestone)}
                        disabled={
                          milestoneUpdatingId === milestone.id ||
                          deletingMilestoneId === milestone.id
                        }
                        title="Eliminar hito"
                      >
                        {deletingMilestoneId === milestone.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {!milestones.length && (
          <EmptyState
            icon={<CircleDot className="h-6 w-6" />}
            title="No hay hitos todavía"
            description="Crea el primer hito para comenzar a estructurar el progreso del proyecto."
          />
        )}
      </div>
    </Card>

    {/* ============================================================
        NUEVO HITO
    ============================================================ */}
    <Card className="h-fit border border-slate-200 bg-white shadow-none">
      <SectionHeader
        icon={<Plus className="h-5 w-5" />}
        title="Nuevo hito"
        description="Añade una nueva etapa al proyecto."
      />

      <div className="space-y-4 p-5">
        <FormField label="Nombre">
          <Input
            value={milestoneForm.nombre}
            onChange={(e) =>
              setMilestoneForm((current) => ({
                ...current,
                nombre: e.target.value,
              }))
            }
            placeholder="Ej. Diseño aprobado"
          />
        </FormField>

        <FormField label="Descripción">
          <Textarea
            value={milestoneForm.descripcion}
            onChange={(e) =>
              setMilestoneForm((current) => ({
                ...current,
                descripcion: e.target.value,
              }))
            }
            placeholder="Describe el objetivo del hito..."
            rows={4}
          />
        </FormField>

        <FormField label="Fecha prevista">
          <Input
            type="datetime-local"
            value={milestoneForm.fecha_prevista}
            onChange={(e) =>
              setMilestoneForm((current) => ({
                ...current,
                fecha_prevista: e.target.value,
              }))
            }
          />
        </FormField>

        <Button
          onClick={createMilestone}
          disabled={creatingMilestone}
          className="w-full bg-[#1E3A8A] hover:bg-[#162D6B]"
        >
          {creatingMilestone ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}

          Crear hito
        </Button>
      </div>
    </Card>
  </div>
)}
        {/* ============================ ACTUALIZACIONES ============================ */}
{activeSection === "actualizaciones" && (
  <div className="grid gap-6 xl:grid-cols-[360px_1fr]">

    {/* ============================================================
        NUEVA ACTUALIZACIÓN
    ============================================================ */}
    <Card className="h-fit border border-slate-200 bg-white shadow-none">
      <SectionHeader
        icon={<Send className="h-5 w-5" />}
        title="Publicar actualización"
        description="Comunicación deliberada al cliente."
      />

      <div className="space-y-4 p-5">
        <FormField label="Título">
          <Input
            value={updateForm.titulo}
            onChange={(e) =>
              setUpdateForm((current) => ({
                ...current,
                titulo: e.target.value,
              }))
            }
            placeholder="Ej. Primera fase completada"
            disabled={publishingUpdate}
          />
        </FormField>

        <FormField label="Contenido">
          <Textarea
            value={updateForm.contenido}
            onChange={(e) =>
              setUpdateForm((current) => ({
                ...current,
                contenido: e.target.value,
              }))
            }
            placeholder="Escribe la actualización que recibirá el cliente..."
            rows={8}
            disabled={publishingUpdate}
          />
        </FormField>

        <div className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-800">
          Al publicar se registra la actualización del proyecto y la
          infraestructura de notificaciones puede comunicarla al
          propietario del proyecto.
        </div>

        <Button
          onClick={publishUpdate}
          disabled={publishingUpdate}
          className="w-full bg-[#1E3A8A] hover:bg-[#162D6B]"
        >
          {publishingUpdate ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}

          Publicar
        </Button>
      </div>
    </Card>

    {/* ============================================================
        HISTORIAL DE ACTUALIZACIONES
    ============================================================ */}
    <Card className="border border-slate-200 bg-white shadow-none">
      <SectionHeader
        icon={<MessageSquare className="h-5 w-5" />}
        title="Historial de actualizaciones"
      />

      <div className="divide-y divide-slate-100">
        {updates.map((update) => (
          <div
            key={update.id}
            className="p-5 lg:p-6"
          >
            {editingUpdateId === update.id ? (

              /* =====================================================
                 MODO EDICIÓN
              ===================================================== */
              <div className="space-y-5">

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">
                    <Pencil className="h-4 w-4" />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Editar actualización
                    </p>

                    <p className="text-xs text-slate-400">
                      Modifica el contenido de esta comunicación.
                    </p>
                  </div>
                </div>

                {/* Título */}
                <FormField label="Título">
                  <Input
                    value={editingUpdateForm.titulo}
                    onChange={(e) =>
                      setEditingUpdateForm((current) => ({
                        ...current,
                        titulo: e.target.value,
                      }))
                    }
                    placeholder="Título de la actualización"
                    disabled={publishingUpdate}
                  />
                </FormField>

                {/* Contenido */}
                <FormField label="Contenido">
                  <Textarea
                    value={editingUpdateForm.contenido}
                    onChange={(e) =>
                      setEditingUpdateForm((current) => ({
                        ...current,
                        contenido: e.target.value,
                      }))
                    }
                    placeholder="Contenido de la actualización..."
                    rows={8}
                    disabled={publishingUpdate}
                  />
                </FormField>

                {/* Botones */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingUpdateId(null);
                      setEditingUpdateForm({
                        titulo: "",
                        contenido: "",
                      });
                    }}
                    disabled={publishingUpdate}
                    className="border-slate-200 bg-white text-slate-700"
                  >
                    Cancelar
                  </Button>

                  <Button
                    type="button"
                    onClick={saveUpdate}
                    disabled={publishingUpdate}
                    className="bg-[#1E3A8A] hover:bg-[#162D6B]"
                  >
                    {publishingUpdate ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}

                    Guardar cambios
                  </Button>
                </div>
              </div>

            ) : (

              /* =====================================================
                 MODO NORMAL
              ===================================================== */
              <>
                <div className="flex items-start justify-between gap-4">

                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-slate-800">
                      {update.titulo}
                    </h3>

                    <p className="mt-1 text-xs text-slate-400">
                      Publicada {formatDateTime(update.created_at)}

                      {update.updated_at &&
                        update.updated_at !== update.created_at && (
                          <>
                            {" · "}
                            Editada {formatDateTime(update.updated_at)}
                          </>
                        )}
                    </p>
                  </div>

                  {/* =================================================
                      ACCIONES
                  ================================================= */}
                  <div className="flex shrink-0 items-center gap-1">

                    {/* Editar */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => startEditingUpdate(update)}
                      disabled={
                        deletingUpdateId === update.id ||
                        publishingUpdate
                      }
                      title="Editar actualización"
                      className="h-9 w-9 text-slate-500 hover:bg-slate-100 hover:text-[#1E3A8A]"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    {/* Eliminar */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteUpdate(update)}
                      disabled={
                        deletingUpdateId === update.id ||
                        publishingUpdate
                      }
                      title="Eliminar actualización"
                      className="h-9 w-9 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      {deletingUpdateId === update.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {update.contenido}
                </p>

                <div className="mt-4">
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-700"
                  >
                    Publicada
                  </Badge>
                </div>
              </>
            )}
          </div>
        ))}

        {!updates.length && (
          <EmptyState
            icon={<MessageSquare className="h-6 w-6" />}
            title="No hay actualizaciones"
            description="Las comunicaciones publicadas al cliente aparecerán aquí."
          />
        )}
      </div>
    </Card>
  </div>
)}

        {/* ============================ DOCUMENTOS ============================ */}
        {activeSection === "documentos" && (
          <Card className="border border-slate-200 bg-white shadow-none">
            <SectionHeader
              icon={<FileText className="h-5 w-5" />}
              title="Documentos del proyecto"
              description="Los documentos de proyecto son PDFs almacenados en el bucket privado de Modira."
              action={
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadDocument(file);
                    }}
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="bg-[#1E3A8A] hover:bg-[#162D6B]"
                  >
                    {uploading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Adjuntar PDF
                  </Button>
                </>
              }
            />

            <div className="p-5 lg:p-6">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="hidden grid-cols-[1fr_150px_130px_110px] gap-4 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 md:grid">
                  <span>Documento</span>
                  <span>Fecha</span>
                  <span>Tamaño</span>
                  <span className="text-right">Acciones</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {documents.map((document) => (
                    <div
                      key={document.id}
                      className="grid gap-3 p-4 md:grid-cols-[1fr_150px_130px_110px] md:items-center md:gap-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-700">
                            {document.file_name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            PDF · documento de proyecto
                          </p>
                        </div>
                      </div>

                      <span className="text-xs text-slate-500">
                        {formatDate(document.created_at)}
                      </span>

                      <span className="text-xs text-slate-500">
                        {formatBytes(document.file_size)}
                      </span>

                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDocument(document)}
                          title="Abrir"
                          className="text-slate-400 hover:bg-blue-50 hover:text-[#1E3A8A]"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteDocument(document)}
                          title="Eliminar"
                          className="text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {!documents.length && (
                    <EmptyState
                      icon={<Paperclip className="h-6 w-6" />}
                      title="No hay documentos"
                      description="Adjunta un PDF para incorporarlo al proyecto."
                    />
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ============================ FINANZAS ============================ */}
        {activeSection === "finanzas" && (
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="border border-slate-200 bg-white shadow-none">
              <SectionHeader
                icon={<FileText className="h-5 w-5" />}
                title="Presupuestos"
                description="Presupuestos asociados directamente a este proyecto."
              />

              <div className="divide-y divide-slate-100">
                {quotations.map((quotation) => (
                  <div
                    key={quotation.id}
                    className="flex items-center justify-between gap-4 p-5"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-700">
                        {quotation.titulo ||
                          quotation.numero_presupuesto ||
                          "Presupuesto"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {quotation.numero_presupuesto || "Sin número"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-800">
                        {formatCurrency(quotation.precio_total)}
                      </p>
                      <Badge
                        variant="outline"
                        className="mt-1 border-slate-200 text-slate-600"
                      >
                        {quotation.estado || "—"}
                      </Badge>
                    </div>
                  </div>
                ))}

                {!quotations.length && (
                  <EmptyInline
                    icon={<FileText className="h-5 w-5" />}
                    text="No hay presupuestos asociados."
                  />
                )}
              </div>
            </Card>

            <Card className="border border-slate-200 bg-white shadow-none">
              <SectionHeader
                icon={<CheckCircle2 className="h-5 w-5" />}
                title="Facturas"
                description="Facturación vinculada al proyecto."
              />

              <div className="divide-y divide-slate-100">
                {billing.map((billing) => (
                  <div
                    key={billing.id}
                    className="flex items-center justify-between gap-4 p-5"
                  >
                    <div>
                      <p className="font-semibold text-slate-700">
                        {billing.numero_factura || "Factura"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Vencimiento: {formatDate(billing.fecha_vencimiento)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-semibold text-slate-800">
                        {formatCurrency(
                          billing.importe_a_pagar ?? billing.monto
                        )}
                      </p>
                      <Badge
                        variant="outline"
                        className={getBillingStatusClass(billing.estado)}
                      >
                        {billing.estado || "—"}
                      </Badge>
                    </div>
                  </div>
                ))}

                {!billing.length && (
                  <EmptyInline
                    icon={<FileText className="h-5 w-5" />}
                    text="No hay facturas asociadas."
                  />
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ============================ SOPORTE ============================ */}
        {activeSection === "soporte" && (
          <Card className="border border-slate-200 bg-white shadow-none">
            <SectionHeader
              icon={<MessageSquare className="h-5 w-5" />}
              title="Soporte"
              description="Tickets relacionados con este proyecto."
            />

            <div className="divide-y divide-slate-100">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-700">
                      {ticket.asunto || "Ticket sin asunto"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(ticket.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={getPriorityClass(ticket.prioridad)}
                    >
                      {ticket.prioridad || "—"}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="border-slate-200 bg-slate-50 text-slate-600"
                    >
                      {ticket.estado || "—"}
                    </Badge>
                  </div>
                </div>
              ))}

              {!tickets.length && (
                <EmptyState
                  icon={<MessageSquare className="h-6 w-6" />}
                  title="No hay tickets"
                  description="No existen tickets asociados a este proyecto."
                />
              )}
            </div>
          </Card>
        )}

        {/* ============================ ACTIVIDAD ============================ */}
        {activeSection === "actividad" && (
          <ProjectActivity
            projectId={project.id}
            projectName={project.nombre}
            onNavigate={onNavigate}
          />
        )}

        {/* ============================ CHANGE REQUESTS ============================ */}
        {changeRequests.length > 0 && activeSection === "resumen" && (
          <Card className="border border-slate-200 bg-white shadow-none">
            <SectionHeader
              icon={<MessageSquare className="h-5 w-5" />}
              title="Solicitudes de cambio"
              description="Solicitudes recibidas desde el área cliente."
              action={
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-amber-700"
                >
                  {pendingChangeRequests} abiertas
                </Badge>
              }
            />

            <div className="divide-y divide-slate-100">
              {changeRequests.map((request) => (
                <div key={request.id} className="p-5 lg:p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <ChangeRequestBadge status={request.status} />
                        <span className="text-xs text-slate-400">
                          {formatDateTime(
                            request.requested_at || request.created_at
                          )}
                        </span>
                      </div>

                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {request.description}
                      </p>

                      {request.review_notes && (
                        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                          <strong className="text-slate-700">
                            Notas de revisión:
                          </strong>{" "}
                          {request.review_notes}
                        </div>
                      )}
                    </div>

                    <div className="w-full max-w-md space-y-2 xl:w-[320px]">
                      <Textarea
                        value={reviewNotes[request.id] || ""}
                        onChange={(e) =>
                          setReviewNotes((current) => ({
                            ...current,
                            [request.id]: e.target.value,
                          }))
                        }
                        placeholder="Notas internas de revisión..."
                        rows={3}
                        disabled={
                          resolvingRequestId === request.id ||
                          request.status === "rejected" ||
                          request.status === "completed"
                        }
                      />

                      <div className="flex flex-wrap gap-2">
                        {request.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              resolveChangeRequest(request, "in_review")
                            }
                            disabled={resolvingRequestId === request.id}
                            className="border-slate-200"
                          >
                            Revisar
                          </Button>
                        )}

                        {["pending", "in_review"].includes(request.status) && (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                resolveChangeRequest(request, "accepted")
                              }
                              disabled={resolvingRequestId === request.id}
                              className="bg-[#1E3A8A] hover:bg-[#162D6B]"
                            >
                              Aceptar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                resolveChangeRequest(request, "rejected")
                              }
                              disabled={resolvingRequestId === request.id}
                              className="border-red-200 text-red-600 hover:bg-red-50"
                            >
                              Rechazar
                            </Button>
                          </>
                        )}

                        {request.status === "accepted" && (
                          <Button
                            size="sm"
                            onClick={() =>
                              resolveChangeRequest(request, "completed")
                            }
                            disabled={resolvingRequestId === request.id}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            <Check className="mr-1.5 h-4 w-4" />
                            Completar
                          </Button>
                        )}

                        {resolvingRequestId === request.id && (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
   ACTIVIDAD
   ========================================================================== */

function ProjectActivity({
  projectId,
}: {
  projectId: string;
  projectName: string;
  onNavigate: (path: string) => void;
}) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);

        const { data, error } = await supabase
          .from("activity_log")
          .select(
            "id, user_id, action, resource_type, resource_id, description, metadata, created_at"
          )
          .eq("resource_id", projectId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;
        if (!cancelled) setActivities(data || []);
      } catch (err) {
        console.error("[ProjectActivity] Error:", err);
        if (!cancelled) setActivities([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <Card className="border border-slate-200 bg-white shadow-none">
      <SectionHeader
        icon={<Clock3 className="h-5 w-5" />}
        title="Actividad del proyecto"
        description="Registro interno de acciones relacionadas con el proyecto."
      />

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#1E3A8A]" />
        </div>
      ) : activities.length ? (
        <div className="divide-y divide-slate-100">
          {activities.map((activity) => (
            <div key={activity.id} className="flex gap-4 p-5">
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <CircleDot className="h-4 w-4" />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">
                  {activity.description ||
                    activity.action ||
                    "Actividad del proyecto"}
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                  <span>
                    {formatDateTime(activity.created_at)}
                  </span>
                  {activity.resource_type && (
                    <span>{activity.resource_type}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Clock3 className="h-6 w-6" />}
          title="Sin actividad registrada"
          description="Las acciones relacionadas con este proyecto aparecerán aquí."
        />
      )}
    </Card>
  );
}

/* ============================================================================
   UI HELPERS
   ========================================================================== */

function getProjectIdFromPath(location: string, base: string) {
  const normalized = location.split("?")[0].replace(/\/+$/, "");
  const normalizedBase = base.replace(/\/+$/, "");

  if (!normalized.startsWith(`${normalizedBase}/`)) return null;

  const remainder = normalized.slice(normalizedBase.length + 1);
  if (!remainder || remainder.includes("/")) return null;

  return remainder;
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
      className={`border border-slate-200 bg-white p-4 shadow-none ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-800">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">
          {icon}
        </div>
      </div>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 border-slate-200 bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
      className={`px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 first:px-6 ${className}`}
    >
      {children}
    </th>
  );
}

function ProjectIcon({ large = false }: { large?: boolean }) {
  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]",
        large ? "h-12 w-12 rounded-2xl" : "h-9 w-9",
      ].join(" ")}
    >
      <FolderKanban className={large ? "h-6 w-6" : "h-4 w-4"} />
    </div>
  );
}

function ProgressCell({
  percentage,
  completed,
  total,
}: {
  percentage: number;
  completed: number;
  total: number;
}) {
  return (
    <div className="w-[150px]">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600">
          {percentage}%
        </span>
        <span className="text-[11px] text-slate-400">
          {completed}/{total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#1E3A8A]"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function getProjectStatusMeta(status: ProjectStatus) {
  switch (status) {
    case "Activo":
      return {
        label: "Activo",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        dot: "bg-emerald-500",
      };
    case "Pendiente":
      return {
        label: "Pendiente",
        className: "border-slate-200 bg-slate-100 text-slate-700",
        dot: "bg-slate-400",
      };
    case "Pausado":
      return {
        label: "Pausado",
        className: "border-amber-200 bg-amber-50 text-amber-700",
        dot: "bg-amber-500",
      };
    case "Entregado":
      return {
        label: "Entregado",
        className: "border-sky-200 bg-sky-50 text-sky-700",
        dot: "bg-sky-500",
      };
    case "Completado":
      return {
        label: "Completado",
        className: "border-violet-200 bg-violet-50 text-violet-700",
        dot: "bg-violet-500",
      };
    default:
      return {
        label: status,
        className: "border-slate-200 bg-slate-100 text-slate-700",
        dot: "bg-slate-400",
      };
  }
}

function StatusBadge({
  status,
}: {
  status: ReturnType<typeof getProjectStatusMeta>;
}) {
  return (
    <Badge variant="outline" className={status.className}>
      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${status.dot}`} />
      {status.label}
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
      {detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}
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
          <h2 className="font-semibold text-slate-800">{title}</h2>
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

function MilestoneCompact({
  milestone,
}: {
  milestone: ProjectMilestone;
}) {
  return (
    <div className="flex items-center gap-4 p-5">
      <div
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
          milestone.estado === "en_curso"
            ? "border-blue-200 bg-blue-50 text-[#1E3A8A]"
            : "border-slate-200 bg-slate-50 text-slate-400",
        ].join(" ")}
      >
        {milestone.estado === "en_curso" ? (
          <Clock3 className="h-4 w-4" />
        ) : (
          <CircleDot className="h-4 w-4" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-700">
          {milestone.nombre}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {formatDate(milestone.fecha_prevista)}
        </p>
      </div>

      <Badge
        variant="outline"
        className={
          milestone.estado === "en_curso"
            ? "border-blue-200 bg-blue-50 text-[#1E3A8A]"
            : "border-slate-200 bg-slate-50 text-slate-500"
        }
      >
        {milestone.estado === "en_curso" ? "En curso" : "Pendiente"}
      </Badge>
    </div>
  );
}

function AttentionRow({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: "warning" | "neutral";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 text-left transition hover:border-slate-200 hover:bg-white"
    >
      <span className="text-sm text-slate-600">{label}</span>
      <span
        className={
          tone === "warning"
            ? "font-bold text-amber-600"
            : "font-semibold text-slate-700"
        }
      >
        {value}
      </span>
    </button>
  );
}

function EmptyInline({
  icon,
  text,
}: {
  icon: ReactNode;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 p-5 text-sm text-slate-400">
      {icon}
      {text}
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
      <h3 className="mt-4 font-semibold text-slate-700">{title}</h3>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-400">
        {description}
      </p>
    </div>
  );
}

function ChangeRequestBadge({
  status,
}: {
  status: ProjectChangeRequest["status"];
}) {
  const meta: Record<
    ProjectChangeRequest["status"],
    { label: string; className: string }
  > = {
    pending: {
      label: "Pendiente",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    },
    in_review: {
      label: "En revisión",
      className: "border-blue-200 bg-blue-50 text-blue-700",
    },
    accepted: {
      label: "Aceptada",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    },
    rejected: {
      label: "Rechazada",
      className: "border-red-200 bg-red-50 text-red-700",
    },
    completed: {
      label: "Completada",
      className: "border-violet-200 bg-violet-50 text-violet-700",
    },
  };

  return (
    <Badge variant="outline" className={meta[status].className}>
      {meta[status].label}
    </Badge>
  );
}

function getBillingStatusClass(status: string | null) {
  switch (String(status || "").toLowerCase()) {
    case "pagada":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "vencida":
      return "border-red-200 bg-red-50 text-red-700";
    case "cancelada":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-amber-200 bg-amber-50 text-amber-700";
  }
}

function getPriorityClass(priority: string | null) {
  switch (String(priority || "").toLowerCase()) {
    case "alta":
      return "border-red-200 bg-red-50 text-red-700";
    case "media":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "baja":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function getTodayForInput() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatBytes(bytes: number | null | undefined) {
  const value = Number(bytes || 0);

  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;

  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}
