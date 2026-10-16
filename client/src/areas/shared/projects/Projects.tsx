import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
  ArrowUpDown,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Filter,
  FolderKanban,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

type ProjectStatus =
  | "Pendiente"
  | "Activo"
  | "Pausado"
  | "Entregado"
  | "Completado";

type SortOption = "recent" | "name" | "start" | "deadline" | "progress";

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
  fecha_prevista: string;
  estado: "pendiente" | "en_curso" | "completado";
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

interface ProjectsProps {
  onOpenProject?: (project: Project) => void;
}

const STATUS_OPTIONS: Array<{ value: "all" | ProjectStatus; label: string }> = [
  { value: "all", label: "Todos los estados" },
  { value: "Pendiente", label: "Pendiente" },
  { value: "Activo", label: "Activo" },
  { value: "Pausado", label: "Pausado" },
  { value: "Entregado", label: "Entregado" },
  { value: "Completado", label: "Completado" },
];

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "recent", label: "Más recientes" },
  { value: "name", label: "Nombre A-Z" },
  { value: "start", label: "Fecha de inicio" },
  { value: "deadline", label: "Fecha de fin" },
  { value: "progress", label: "Progreso" },
];

export default function Projects({ onOpenProject }: ProjectsProps) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [permissions, setPermissions] = useState({
    read: false,
    create: false,
  });
  const [permissionsLoading, setPermissionsLoading] = useState(true);

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

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  const [creationClients, setCreationClients] = useState<ProjectCreationClient[]>([]);
  const [loadingCreationOptions, setLoadingCreationOptions] = useState(false);
const [creationForm, setCreationForm] = useState({
  client_id: "",
  nombre: "",
  descripcion: "",
  fecha_inicio: getTodayForInput(),
  fecha_fin: "",
});

  const checkPermissions = useCallback(async () => {
    if (!user?.id) {
      setPermissions({ read: false, create: false });
      setPermissionsLoading(false);
      return;
    }

    setPermissionsLoading(true);

    try {
      const codes = ["projects.read", "projects.create"] as const;
      const entries = await Promise.all(
        codes.map(async (code) => {
          const { data, error: permissionError } = await supabase.rpc(
            "current_worker_has_permission",
            { p_permission_code: code },
          );

          return [
            code,
            permissionError ? false : data === true,
          ] as const;
        }),
      );

      const result = Object.fromEntries(entries);
      setPermissions({
        read: result["projects.read"] === true,
        create: result["projects.create"] === true,
      });
    } catch (err) {
      console.error("[Projects] Permission check error:", err);
      setPermissions({ read: false, create: false });
    } finally {
      setPermissionsLoading(false);
    }
  }, [user?.id]);

  const loadProjects = useCallback(
    async (silent = false) => {
      if (!user?.id || !permissions.read) {
        setProjects([]);
        setProgressByProject({});
        setMilestones([]);
        setLoading(false);
        return;
      }

      try {
        if (silent) setRefreshing(true);
        else setLoading(true);

        setError(null);

        const { data, error: projectsError } = await supabase.rpc(
          "get_worker_projects",
        );

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
              "project_id, total_milestones, completed_milestones, progress_percentage",
            )
            .in("project_id", ids),
          supabase
            .from("project_milestones")
            .select("id, project_id, nombre, fecha_prevista, estado")
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
              (milestone) => milestone.project_id === id,
            );
            const total = list.length;
            const completed = list.filter(
              (milestone) => milestone.estado === "completado",
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
        console.error("[Projects] Error loading projects:", err);
        setError(err?.message || "No se pudieron cargar los proyectos.");
        setProjects([]);
        setProgressByProject({});
        setMilestones([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [permissions.read, user?.id],
  );

  useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  useEffect(() => {
    if (!permissionsLoading) loadProjects();
  }, [loadProjects, permissionsLoading]);

  const resetCreationForm = useCallback(() => {
    setCreationForm({
      client_id: "",
      nombre: "",
      descripcion: "",
      fecha_inicio: getTodayForInput(),
      fecha_fin: "",
    });
    setCreationError(null);
  }, []);

  const openProject = useCallback(
    (project: Project) => {
      if (onOpenProject) {
        onOpenProject(project);
        return;
      }
      setLocation(`/employee/projects/${project.id}`);
    },
    [onOpenProject, setLocation],
  );

  const openCreateProject = useCallback(async () => {
    if (!permissions.create) return;

    resetCreationForm();
    setShowCreateProject(true);
    setLoadingCreationOptions(true);

    try {
      const { data, error } = await supabase
  .from("clients")
  .select(
    "id, company_id, profile_id, nombre, email, empresa, is_active",
  )
  .eq("is_active", true)
  .order("nombre", { ascending: true });

if (error) throw error;

setCreationClients((data || []) as ProjectCreationClient[]);
    } catch (err: any) {
      console.error("[Projects] Error loading creation options:", err);
      setCreationError(
        err?.message ||
          "No se pudieron cargar las empresas y clientes disponibles.",
      );
    } finally {
      setLoadingCreationOptions(false);
    }
  }, [permissions.create, resetCreationForm]);

  const closeCreateProject = useCallback(() => {
    if (creatingProject) return;
    setShowCreateProject(false);
    setCreationError(null);
  }, [creatingProject]);

  const handleCreateProject = useCallback(async () => {
    if (!permissions.create) return;

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
        "La descripción del proyecto no puede superar 5000 caracteres.",
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
        "La fecha de fin no puede ser anterior a la fecha de inicio.",
      );
      return;
    }

    const selectedClient = creationClients.find(
      (client) => client.id === creationForm.client_id,
    );

    if (!selectedClient) {
      setCreationError("El cliente seleccionado ya no está disponible.");
      return;
    }

    if (!selectedClient.profile_id) {
      setCreationError(
        "El cliente seleccionado no está vinculado a un usuario de Modira.",
      );
      return;
    }

    try {
      setCreatingProject(true);

      const { data: createdData, error: createError } = await supabase.rpc(
        "create_project_by_worker",
        {
          p_client_id: creationForm.client_id,
          p_descripcion: description,
          p_fecha_inicio: startDate.toISOString(),
          p_fecha_fin: endDate ? endDate.toISOString() : null,
        },
      );

      if (createError) throw createError;

      const createdProject = Array.isArray(createdData)
        ? createdData[0]
        : createdData;

      if (!createdProject?.id) {
        throw new Error("No se recibió el proyecto creado.");
      }

      const { data: renamedProject, error: renameError } = await supabase.rpc(
        "update_project_by_worker",
        {
          p_project_id: createdProject.id,
          p_nombre: name,
          p_estado: null,
        },
      );

      if (renameError) {
        throw new Error(
          `El proyecto se creó, pero no se pudo establecer su nombre: ${
            renameError.message || "error desconocido"
          }`,
        );
      }

      const finalProject = Array.isArray(renamedProject)
        ? renamedProject[0]
        : renamedProject;

      setShowCreateProject(false);
      resetCreationForm();
      await loadProjects(true);

      toast.success("Proyecto creado correctamente.");

      if (finalProject?.id) {
        openProject(finalProject as Project);
      }
    } catch (err: any) {
      console.error("[Projects] Error creating project:", err);
      setCreationError(err?.message || "No se pudo crear el proyecto.");
    } finally {
      setCreatingProject(false);
    }
  }, [
    creationClients,
    creationForm,
    loadProjects,
    openProject,
    permissions.create,
    resetCreationForm,
  ]);


  const companies = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      if (project.company_id) {
        map.set(project.company_id, project.empresa_nombre || "Sin empresa");
      }
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], "es"),
    );
  }, [projects]);

  const users = useMemo(() => {
    const map = new Map<string, { name: string; email: string }>();
    for (const project of projects) {
      if (project.user_id) {
        map.set(project.user_id, {
          name: project.cliente_nombre || "Sin nombre",
          email: project.cliente_email || "",
        });
      }
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name, "es"),
    );
  }, [projects]);

  const stats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((p) => p.estado === "Activo").length;
    const pending = projects.filter((p) => p.estado === "Pendiente").length;
    const completed = projects.filter((p) =>
      ["Entregado", "Completado"].includes(p.estado),
    ).length;

    const overdue = projects.filter((p) => {
      if (!p.fecha_fin || ["Entregado", "Completado"].includes(p.estado)) {
        return false;
      }
      return new Date(p.fecha_fin).getTime() < Date.now();
    }).length;

    const progressRows = projects
      .map((project) => progressByProject[project.id]?.progress_percentage)
      .filter((value): value is number => typeof value === "number");

    const averageProgress = progressRows.length
      ? Math.round(
          progressRows.reduce((sum, value) => sum + Number(value), 0) /
            progressRows.length,
        )
      : 0;

    const upcoming = projects.filter((project) => {
      if (!project.fecha_fin || ["Entregado", "Completado"].includes(project.estado)) {
        return false;
      }
      const days =
        (new Date(project.fecha_fin).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 14;
    }).length;

    return {
      total,
      active,
      pending,
      completed,
      overdue,
      upcoming,
      averageProgress,
    };
  }, [projects, progressByProject]);

  const getNextMilestone = useCallback(
    (projectId: string) => {
      return (
        milestones
          .filter(
            (milestone) =>
              milestone.project_id === projectId &&
              milestone.estado !== "completado",
          )
          .sort(
            (a, b) =>
              new Date(a.fecha_prevista).getTime() -
              new Date(b.fecha_prevista).getTime(),
          )[0] || null
      );
    },
    [milestones],
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
        ].some((value) => String(value || "").toLowerCase().includes(search));

      const statusMatch =
        statusFilter === "all" || project.estado === statusFilter;
      const companyMatch =
        companyFilter === "all" || project.company_id === companyFilter;
      const userMatch = userFilter === "all" || project.user_id === userFilter;

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

  if (permissionsLoading) {
    return <PageLoading label="Preparando el área de proyectos..." />;
  }

  if (!permissions.read) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] px-5 py-8 text-[#172033] sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[520px] max-w-[1540px] items-center justify-center">
          <Card className="w-full max-w-xl border border-slate-200 bg-white p-8 shadow-none">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-xl font-bold text-slate-900">
              Acceso no disponible
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Tu trabajador no dispone del permiso necesario para consultar proyectos.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#172033]">
      <div className="mx-auto w-full max-w-[1540px] space-y-6 px-5 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-sm text-slate-400">
              <FolderKanban className="h-4 w-4 text-[#1E3A8A]" />
              <span>Operaciones</span>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>Proyectos</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Proyectos
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Seguimiento operativo de proyectos, clientes, hitos y fechas clave.
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

            {permissions.create && (
              <Button
                onClick={openCreateProject}
                className="bg-[#1E3A8A] text-white hover:bg-[#162D6B]"
              >
                <Plus className="mr-2 h-4 w-4" />
                Nuevo proyecto
              </Button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-6">
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
            icon={<CalendarDays className="h-5 w-5" />}
            label="Próximos"
            value={stats.upcoming}
            detail="Vencen en 14 días"
          />
          <SummaryCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="Progreso medio"
            value={`${stats.averageProgress}%`}
            detail={stats.overdue ? `${stats.overdue} fuera de plazo` : "Calculado por hitos"}
          />
        </div>

        {error && (
          <Card className="border border-red-200 bg-red-50 shadow-none">
            <div className="flex items-start gap-3 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div className="min-w-0 flex-1">
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

        <Card className="overflow-visible border border-slate-200 bg-white shadow-none">
          <div className="p-4 lg:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
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
                  onValueChange={(value) => setSortOption(value as SortOption)}
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
                    ...companies.map(([id, name]) => ({ value: id, label: name })),
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
                      label: `${person.name}${person.email ? ` · ${person.email}` : ""}`,
                    })),
                  ]}
                />
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-500">
                Mostrando <strong className="text-slate-700">{filteredProjects.length}</strong>{" "}
                de <strong className="text-slate-700">{projects.length}</strong> proyectos
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
                  : "Los proyectos disponibles para tu rol aparecerán aquí."}
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
                      100,
                    );
                    const nextMilestone = getNextMilestone(project.id);
                    const status = getProjectStatusMeta(project.estado);
                    const overdue = isProjectOverdue(project);

                    return (
                      <tr
                        key={project.id}
                        onClick={() => openProject(project)}
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
                              <p className="mt-1 truncate pl-6 text-xs text-slate-400">
                                {project.cliente_email}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-5">
                          <div className="w-[150px]">
                            <div className="mb-1.5 flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-700">
                                {percentage}%
                              </span>
                              <span className="text-slate-400">
                                {progress?.completed_milestones || 0}/{progress?.total_milestones || 0}
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-[#1E3A8A]"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-5">
                          {nextMilestone ? (
                            <div className="max-w-[180px]">
                              <p className="truncate text-sm font-medium text-slate-700">
                                {nextMilestone.nombre}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {formatDate(nextMilestone.fecha_prevista)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">Sin hitos pendientes</span>
                          )}
                        </td>
                        <td className="px-4 py-5">
                          <Badge
                            variant="outline"
                            className={`${status.className} whitespace-nowrap`}
                          >
                            {status.label}
                          </Badge>
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
                        </td>
                        <td className="px-4 py-5 text-right">
                          <ChevronRight className="ml-auto h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#1E3A8A]" />
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
                  100,
                );
                const nextMilestone = getNextMilestone(project.id);
                const status = getProjectStatusMeta(project.estado);
                const overdue = isProjectOverdue(project);

                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => openProject(project)}
                    className="block w-full text-left transition-colors hover:bg-slate-50"
                  >
                    <div className="space-y-4 p-5">
                      <div className="flex items-start gap-3">
                        <ProjectIcon />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-800">
                                {project.nombre}
                              </p>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {project.empresa_nombre || "Sin empresa"}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-400">Cliente</p>
                          <p className="mt-1 truncate font-medium text-slate-700">
                            {project.cliente_nombre || "Sin nombre"}
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3">
                          <p className="text-xs text-slate-400">Estado</p>
                          <div className="mt-1">
                            <Badge variant="outline" className={status.className}>
                              {status.label}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700">Progreso</span>
                          <span className="text-slate-500">{percentage}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-[#1E3A8A]"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                        <span>Inicio: {formatDate(project.fecha_inicio)}</span>
                        <span className={overdue ? "font-semibold text-red-600" : ""}>
                          Fin: {formatDate(project.fecha_fin)}
                        </span>
                      </div>

                      {nextMilestone && (
                        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                          <div className="min-w-0">
                            <p className="text-xs text-slate-400">Próximo hito</p>
                            <p className="truncate text-sm font-medium text-slate-700">
                              {nextMilestone.nombre}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-slate-400">
                            {formatDate(nextMilestone.fecha_prevista)}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {showCreateProject && permissions.create && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A8A]">
                    Nuevo proyecto
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">
                    Crear proyecto
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    El cliente y su empresa se validan en el backend mediante la RPC autorizada.
                  </p>
                </div>
                <Button
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

              <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
                {creationError && (
                  <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                    <p className="text-sm leading-5 text-red-700">{creationError}</p>
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
                  <div className="space-y-5">
                  <FormField label="Cliente propietario">
  <Select
    value={creationForm.client_id}
    onValueChange={(value) =>
      setCreationForm((current) => ({
        ...current,
        client_id: value,
      }))
    }
    disabled={creatingProject || !creationClients.length}
  >
    <SelectTrigger className="h-10 border-slate-200 bg-white">
      <SelectValue
        placeholder={
          creationClients.length
            ? "Selecciona un cliente"
            : "No hay clientes disponibles"
        }
      />
    </SelectTrigger>

    <SelectContent>
      {creationClients.map((client) => (
        <SelectItem key={client.id} value={client.id}>
          {client.nombre || "Cliente sin nombre"}
          {client.email ? ` · ${client.email}` : ""}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</FormField>

                    {creationForm.client_id && (
  <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-xs text-slate-500">
    <Building2 className="h-4 w-4 shrink-0 text-slate-400" />

    <span>
      Empresa asignada:{" "}
      <strong className="font-semibold text-slate-700">
        {creationClients.find(
          (client) => client.id === creationForm.client_id,
        )?.empresa || "Sin empresa"}
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
                  </div>
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

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <Card className="border border-slate-200 bg-white p-5 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-[#1E3A8A]">
          {icon}
        </div>
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-slate-400">{detail}</p>
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
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
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
      className={`px-4 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 first:pl-6 ${className}`}
    >
      {children}
    </th>
  );
}

function ProjectIcon({ large = false }: { large?: boolean }) {
  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-[#1E3A8A]",
        large ? "h-14 w-14" : "h-10 w-10",
      ].join(" ")}
    >
      <FolderKanban className={large ? "h-7 w-7" : "h-5 w-5"} />
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
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function PageLoading({ label }: { label: string }) {
  return (
    <div className="min-h-screen bg-[#F7F8FA] px-5 py-8">
      <div className="mx-auto flex min-h-[520px] max-w-[1540px] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]" />
        <p className="mt-4 text-sm font-medium text-slate-600">{label}</p>
      </div>
    </div>
  );
}

function getProjectStatusMeta(status: ProjectStatus) {
  switch (status) {
    case "Activo":
      return {
        label: "Activo",
        className: "border-blue-200 bg-blue-50 text-[#1E3A8A]",
      };
    case "Pendiente":
      return {
        label: "Pendiente",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      };
    case "Pausado":
      return {
        label: "Pausado",
        className: "border-slate-200 bg-slate-100 text-slate-600",
      };
    case "Entregado":
      return {
        label: "Entregado",
        className: "border-violet-200 bg-violet-50 text-violet-700",
      };
    case "Completado":
      return {
        label: "Completado",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
  }
}

function isProjectOverdue(project: Project) {
  return (
    Boolean(project.fecha_fin) &&
    new Date(project.fecha_fin as string).getTime() < Date.now() &&
    !["Entregado", "Completado"].includes(project.estado)
  );
}

function getTodayForInput() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
