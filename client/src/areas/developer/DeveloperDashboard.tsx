import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CalendarDays,
  Code2,
  ExternalLink,
  Flag,
  FolderKanban,
  GitBranch,
  Loader2,
  ListTodo,
  RefreshCw,
  Search,
  ServerCog,
  ShieldAlert,
  Ticket,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  formatDistanceToNow,
  isBefore,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from "date-fns";
import { es } from "date-fns/locale";

type DashboardPeriod =
  | "today"
  | "7d"
  | "30d"
  | "month"
  | "previousMonth"
  | "quarter"
  | "year";

type PermissionCode =
  | "projects.read"
  | "projects.create"
  | "projects.update"
  | "projects.delete"
  | "automations.read"
  | "automations.create"
  | "automations.update"
  | "automations.delete"
  | "automations.execute"
  | "ai.read"
  | "ai.use"
  | "ai.manage"
  | "support.read"
  | "support.update"
  | "logs.read"
  | "webhooks.read"
  | "webhooks.manage";

type ProjectRow = {
  id: string;
  nombre?: string | null;
  descripcion?: string | null;
  estado?: string | null;
  company_id?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  updated_at?: string | null;
};

type MilestoneRow = {
  id: string;
  project_id?: string | null;
  nombre?: string | null;
  fecha_prevista?: string | null;
  estado?: string | null;
  completed_at?: string | null;
};

type ProgressRow = {
  project_id: string;
  total_milestones?: number | null;
  completed_milestones?: number | null;
  progress_percentage?: number | null;
};

type AutomationRunRow = {
  id: string;
  automation_id?: string | null;
  company_id?: string | null;
  estado?: string | null;
  inicio?: string | null;
  finalizacion?: string | null;
  duracion_ms?: number | null;
  error?: string | null;
  created_at?: string | null;
};

type AutomationRow = {
  id: string;
  nombre?: string | null;
  descripcion?: string | null;
  estado?: string | null;
  frecuencia?: string | null;
  company_id?: string | null;
  updated_at?: string | null;
};

type TicketRow = {
  id: string;
  titulo?: string | null;
  estado?: string | null;
  prioridad?: string | null;
  company_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ActivityRow = {
  id: string;
  action?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  description?: string | null;
  created_at?: string | null;
};

type AiPanelData = {
  summary?: {
    total_reservations?: number;
    active_reservations?: number;
    consumed_reservations?: number;
    total_input_tokens_real?: number;
    total_output_tokens_real?: number;
    total_real_cost_cents?: number;
  };
};

type DashboardTaskMode = "internal" | "project";

type DashboardTaskRow = {
  id: string;
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  progress?: number | null;
  due_at?: string | null;
  assigned_to_worker_id?: string | null;
  project_id?: string | null;
  milestone_id?: string | null;
};

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "month", label: "Este mes" },
  { value: "previousMonth", label: "Mes anterior" },
  { value: "quarter", label: "Este trimestre" },
  { value: "year", label: "Este año" },
];

const euro = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 0,
});

function normalizeStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function getPeriodRange(period: DashboardPeriod) {
  const now = new Date();
  switch (period) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "7d":
      return { start: startOfDay(addDays(now, -6)), end: endOfDay(now) };
    case "30d":
      return { start: startOfDay(addDays(now, -29)), end: endOfDay(now) };
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "previousMonth": {
      const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: startOfMonth(previous), end: endOfMonth(previous) };
    }
    case "quarter":
      return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "year":
      return { start: startOfYear(now), end: endOfYear(now) };
  }
}

function isInside(date: string | null | undefined, start: Date, end: Date) {
  if (!date) return false;
  const value = new Date(date);
  return !Number.isNaN(value.getTime()) && value >= start && value <= end;
}

function StatusPill({ status }: { status: string | null | undefined }) {
  const value = normalizeStatus(status);
  const config =
    value === "error" || value === "cerrado" || value === "cancelado"
      ? { label: value || "error", className: "bg-red-50 text-red-700 border-red-100" }
      : value === "exito" || value === "completado" || value === "activo"
        ? { label: value || "ok", className: "bg-emerald-50 text-emerald-700 border-emerald-100" }
        : value === "ejecutando" || value === "en_curso" || value === "pendiente"
          ? { label: value || "pendiente", className: "bg-amber-50 text-amber-700 border-amber-100" }
          : { label: value || "—", className: "bg-slate-50 text-slate-600 border-slate-100" };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${config.className}`}>
      {config.label.replaceAll("_", " ")}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "danger" | "success" | "warning";
}) {
  const toneClasses = {
    default: "bg-slate-50 text-slate-700",
    danger: "bg-red-50 text-red-700",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-sm text-slate-500">{detail}</p>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  accent = "default",
  onClick,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string;
  detail: string;
  accent?: "default" | "success" | "danger" | "warning";
  onClick?: () => void;
}) {
  const accentClasses = {
    default: "text-[#596577] bg-white",
    success: "text-[#3D8B6D] bg-[#E9F8F1]",
    danger: "text-[#B94A48] bg-[#FFF1EF]",
    warning: "text-[#A87519] bg-[#FFF7E7]",
  };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#7F8998]">
            {label}
          </p>

          <p className="mt-1 text-[22px] font-bold tracking-tight text-[#18212F]">
            {value}
          </p>

          <p className="mt-0.5 text-[10px] text-[#697588]">
            {detail}
          </p>
        </div>

        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            accentClasses[accent]
          }`}
        >
          <Icon className="h-4 w-4" strokeWidth={1.8} />
        </span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full p-3 text-left transition hover:bg-white/70"
      >
        {content}
      </button>
    );
  }

  return <div className="p-3">{content}</div>;
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{eyebrow}</p>}
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Activity; text: string }) {
  return (
    <div className="flex min-h-[150px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center">
      <Icon className="h-6 w-6 text-slate-300" />
      <p className="mt-3 text-sm text-slate-500">{text}</p>
    </div>
  );
}

export default function DeveloperDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [taskMode, setTaskMode] = useState<DashboardTaskMode>("internal");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [data, setData] = useState({
    workerName: "Trabajador",
    projects: [] as ProjectRow[],
    milestones: [] as MilestoneRow[],
    progress: [] as ProgressRow[],
    automations: [] as AutomationRow[],
    automationRuns: [] as AutomationRunRow[],
    tickets: [] as TicketRow[],
    activity: [] as ActivityRow[],
    ai: null as AiPanelData | null,
    internalTasks: [] as DashboardTaskRow[],
    projectTasks: [] as DashboardTaskRow[],
  });

  const range = useMemo(() => getPeriodRange(period), [period]);

  const checkPermissions = useCallback(async () => {
    const codes: PermissionCode[] = [
      "projects.read",
      "projects.create",
      "projects.update",
      "projects.delete",
      "automations.read",
      "automations.create",
      "automations.update",
      "automations.delete",
      "automations.execute",
      "ai.read",
      "ai.use",
      "ai.manage",
      "support.read",
      "support.update",
      "logs.read",
      "webhooks.read",
      "webhooks.manage",
    ];

    const results = await Promise.all(
      codes.map(async (code) => {
        const { data: allowed } = await supabase.rpc("current_worker_has_permission", {
          p_permission_code: code,
        });
        return [code, allowed === true] as const;
      })
    );

    return Object.fromEntries(results);
  }, []);

  const loadDashboard = useCallback(
    async (isRefresh = false) => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setWarning(null);

      try {
        const permissionState = await checkPermissions();
        setPermissions(permissionState);

        const [
          workerResult,
          projectsResult,
          milestonesResult,
          progressResult,
          automationsResult,
          automationRunsResult,
          ticketsResult,
          activityResult,
          aiResult,
        ] = await Promise.all([
          supabase
            .from("workers")
            .select("id, auth_user_id, display_name")
            .eq("auth_user_id", user.id)
            .maybeSingle(),
          supabase
            .from("projects")
            .select("id, nombre, descripcion, estado, company_id, fecha_inicio, fecha_fin, updated_at")
            .order("updated_at", { ascending: false }),
          supabase
            .from("project_milestones")
            .select("id, project_id, nombre, fecha_prevista, estado, completed_at")
            .order("fecha_prevista", { ascending: true }),
          supabase
            .from("project_progress")
            .select("project_id, total_milestones, completed_milestones, progress_percentage"),
          supabase
            .from("automations")
            .select("id, nombre, descripcion, estado, frecuencia, company_id, updated_at")
            .order("updated_at", { ascending: false }),
          supabase
            .from("automation_runs")
            .select("id, automation_id, company_id, estado, inicio, finalizacion, duracion_ms, error, created_at")
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("support_tickets")
            .select("id, titulo, estado, prioridad, company_id, created_at, updated_at")
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("activity_log")
            .select("id, action, resource_type, resource_id, description, created_at")
            .order("created_at", { ascending: false })
            .limit(40),
          supabase.rpc("get_ai_worker_panel_data"),
        ]);

        const failed = [
          ["trabajador", workerResult.error],
          ["proyectos", projectsResult.error],
          ["hitos", milestonesResult.error],
          ["progreso", progressResult.error],
          ["automatizaciones", automationsResult.error],
          ["ejecuciones", automationRunsResult.error],
          ["soporte", ticketsResult.error],
          ["actividad", activityResult.error],
          ["IA", aiResult.error],
        ].filter(([, error]) => error);

        if (failed.length) {
          setWarning(`Algunos datos técnicos no pudieron cargarse: ${failed.map(([name]) => name).join(", ")}.`);
        }

        setData({
          workerName: workerResult.data?.display_name?.trim() || "Trabajador",
          projects: (projectsResult.data || []) as ProjectRow[],
          milestones: (milestonesResult.data || []) as MilestoneRow[],
          progress: (progressResult.data || []) as ProgressRow[],
          automations: (automationsResult.data || []) as AutomationRow[],
          automationRuns: (automationRunsResult.data || []) as AutomationRunRow[],
          tickets: (ticketsResult.data || []) as TicketRow[],
          activity: (activityResult.data || []) as ActivityRow[],
          ai: (aiResult.data || null) as AiPanelData | null,
          internalTasks: [],
          projectTasks: [],
        });

        // El dashboard solo muestra tareas asignadas al developer que ha iniciado sesión.
        const currentWorkerId = workerResult.data?.id ?? null;
        if (currentWorkerId) {
          const [internalTasksResult, projectTasksResult] = await Promise.all([
            supabase.rpc("get_internal_tasks", {
              p_status: null,
              p_limit: 100,
              p_offset: 0,
            }),
            supabase.rpc("get_project_tasks", {
              p_project_id: null,
              p_milestone_id: null,
              p_status: null,
              p_priority: null,
              p_assigned_to_worker_id: currentWorkerId,
              p_limit: 200,
            }),
          ]);

          if (internalTasksResult.error) console.warn("Developer dashboard: tareas internas", internalTasksResult.error);
          if (projectTasksResult.error) console.warn("Developer dashboard: tareas de proyecto", projectTasksResult.error);

          setData((current) => ({
            ...current,
            internalTasks: ((internalTasksResult.data || []) as DashboardTaskRow[]).filter(
              (task) => task.assigned_to_worker_id === currentWorkerId,
            ),
            projectTasks: (projectTasksResult.data || []) as DashboardTaskRow[],
          }));
        }
      } catch (error) {
        console.error("Developer dashboard load error", error);
        setWarning("No se ha podido cargar completamente el dashboard técnico.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [checkPermissions, user?.id]
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const metrics = useMemo(() => {
    const statusCounts = {
      active: 0,
      paused: 0,
      completed: 0,
      other: 0,
    };

    data.projects.forEach((project) => {
      const status = normalizeStatus(project.estado);
      if (["activo", "en_curso", "active"].includes(status)) statusCounts.active += 1;
      else if (["pausado", "paused", "en_pausa"].includes(status)) statusCounts.paused += 1;
      else if (["completado", "completed"].includes(status)) statusCounts.completed += 1;
      else statusCounts.other += 1;
    });

    const activeProjects = data.projects.filter((p) => {
      const status = normalizeStatus(p.estado);
      return status === "activo" || status === "en_curso" || status === "active";
    });

    const completedProjects = data.projects.filter((p) => {
      const status = normalizeStatus(p.estado);
      return status === "completado" || status === "completed";
    });

    const nonCompletedProjects = data.projects.filter((p) => {
      const status = normalizeStatus(p.estado);
      return !["completado", "completed"].includes(status);
    });

    const upcomingMilestones = data.milestones.filter((m) => {
      const date = m.fecha_prevista ? new Date(m.fecha_prevista) : null;
      if (!date || Number.isNaN(date.getTime())) return false;
      return date >= startOfDay(new Date()) && date <= endOfDay(addDays(new Date(), 14)) && normalizeStatus(m.estado) !== "completado";
    });

    const runsInPeriod = data.automationRuns.filter((r) => isInside(r.created_at, range.start, range.end));
    const runErrors = runsInPeriod.filter((r) => normalizeStatus(r.estado) === "error");
    const successfulRuns = runsInPeriod.filter((r) => normalizeStatus(r.estado) === "exito");
    const running = data.automationRuns.filter((r) => normalizeStatus(r.estado) === "ejecutando").length;
    const pendingRuns = data.automationRuns.filter((r) => normalizeStatus(r.estado) === "pendiente").length;

    const openTickets = data.tickets.filter((t) => !["cerrado", "closed", "resuelto", "resolved"].includes(normalizeStatus(t.estado)));
    const urgentTickets = openTickets.filter((t) => ["alta", "urgente", "critical", "high"].includes(normalizeStatus(t.prioridad)));

    const activeAutomations = data.automations.filter((a) => ["activo", "active", "enabled"].includes(normalizeStatus(a.estado)));

    const pendingInternalTasks = data.internalTasks.filter((task) => !["completed", "cancelled"].includes(normalizeStatus(task.status)));
    const pendingProjectTasks = data.projectTasks.filter((task) => !["completed", "cancelled"].includes(normalizeStatus(task.status)));
    const pendingTasks = [...pendingInternalTasks, ...pendingProjectTasks];
    const urgentTasks = pendingTasks.filter((task) => ["urgent", "high"].includes(normalizeStatus(task.priority)));

    return {
      activeProjects,
      completedProjects,
      nonCompletedProjects,
      statusCounts,
      upcomingMilestones,
      runsInPeriod,
      runErrors,
      successfulRuns,
      running,
      pendingRuns,
      openTickets,
      urgentTickets,
      activeAutomations,
      totalAutomations: data.automations.length,
      automationSuccessRate: runsInPeriod.length ? Math.round((successfulRuns.length / runsInPeriod.length) * 100) : 0,
      pendingInternalTasks,
      pendingProjectTasks,
      pendingTasks,
      urgentTasks,
    };
  }, [data, range]);

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return metrics.nonCompletedProjects.slice(0, 8);
    return metrics.nonCompletedProjects
      .filter((p) => `${p.nombre ?? ""} ${p.descripcion ?? ""}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [metrics.nonCompletedProjects, search]);

  const projectProgress = useMemo(() => {
    const map = new Map(data.progress.map((p) => [p.project_id, p]));
    return filteredProjects.map((project) => ({
      project,
      progress: map.get(project.id)?.progress_percentage ?? 0,
    }));
  }, [data.progress, filteredProjects]);

  const automationMap = useMemo(() => new Map(data.automations.map((a) => [a.id, a])), [data.automations]);

  const latestErrors = useMemo(
    () => data.automationRuns.filter((r) => normalizeStatus(r.estado) === "error").slice(0, 6),
    [data.automationRuns]
  );

  const latestRuns = useMemo(() => data.automationRuns.slice(0, 8), [data.automationRuns]);

  const aiSummary = data.ai?.summary;
  const aiCost = Number(aiSummary?.total_real_cost_cents ?? 0) / 100;

  const dashboardTasks = useMemo(() => {
    const source = taskMode === "internal" ? data.internalTasks : data.projectTasks;
    return [...source]
      .filter((task) => !["completed", "cancelled"].includes(normalizeStatus(task.status)))
      .sort((a, b) => {
        const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
        const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
        return aDue - bDue;
      })
      .slice(0, 5);
  }, [data.internalTasks, data.projectTasks, taskMode]);

 

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] px-5 py-8 text-slate-900">
        <div className="mx-auto flex min-h-[70vh] max-w-[1540px] items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-[#7B8797]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando dashboard técnico…
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#18212F]">
      <div className="mx-auto max-w-[1540px] px-5 py-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#18212F] text-white shadow-[0_1px_2px_rgba(16,24,40,0.08)]">
              <Code2 className="h-4 w-4" strokeWidth={1.8} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#98A1AE]">Modira · Developer</p>
              <h1 className="mt-0.5 truncate text-[18px] font-semibold tracking-[-0.025em] text-[#18212F]">Centro técnico</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigate("/employee/notifications")} className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E0E4E9] bg-white text-[#697588] hover:text-[#18212F]" aria-label="Notificaciones">
              <Bell className="h-3.5 w-3.5" strokeWidth={1.8} />
            </button>
            <button type="button" onClick={() => void loadDashboard(true)} disabled={refreshing} className="flex h-8 items-center gap-1.5 rounded-lg border border-[#E0E4E9] bg-white px-2.5 text-[10px] font-semibold text-[#5F6C7E] hover:text-[#18212F] disabled:opacity-60">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={1.8} />
              Actualizar
            </button>
            <div className="hidden h-8 items-center gap-2 rounded-lg border border-[#E0E4E9] bg-white px-2 sm:flex">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#18212F] text-[9px] font-bold text-white">{(data.workerName || "D").slice(0, 1).toUpperCase()}</div>
              <span className="max-w-[130px] truncate text-[10px] font-semibold text-[#4D5A6D]">{data.workerName}</span>
            </div>
          </div>
        </header>

        <section className="mt-4 rounded-[10px] border border-[#E1E5EA] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.02)] sm:px-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#96A0AE]">Operaciones técnicas</p>
              <h2 className="mt-1 text-[21px] font-semibold tracking-[-0.035em] text-[#18212F]">Todo lo técnico, en un solo lugar.</h2>
              <p className="mt-1.5 max-w-3xl text-[11px] leading-5 text-[#7A8697]">Proyectos, automatizaciones, ejecuciones, incidencias, soporte, IA y tareas asignadas al developer que ha iniciado sesión.</p>
            </div>
            <div className="relative shrink-0">
              <button type="button" onClick={() => setPeriodOpen((value) => !value)} className="inline-flex h-8 min-w-[160px] items-center justify-between gap-3 rounded-lg border border-[#E0E4E9] bg-white px-3 text-[10px] font-semibold text-[#4D5A6D] shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
                {PERIODS.find((item) => item.value === period)?.label}
                <ChevronDown className="h-3.5 w-3.5 text-[#9099A7]" strokeWidth={1.8} />
              </button>
              {periodOpen ? (
                <div className="absolute right-0 top-10 z-30 w-48 rounded-xl border border-[#E1E5EA] bg-white p-1.5 shadow-[0_12px_35px_rgba(20,28,40,0.12)]">
                  {PERIODS.map((item) => (
                    <button key={item.value} type="button" onClick={() => { setPeriod(item.value); setPeriodOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${period === item.value ? "bg-[#F1F3F5] font-semibold text-[#18212F]" : "text-[#647084] hover:bg-[#F7F8FA]"}`}>
                      {item.label}
                      {period === item.value ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {warning ? (
          <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-[#F1D6A4] bg-[#FFF8E8] px-3 py-2.5 text-[10px] text-[#8A5A10]">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{warning}</span>
          </div>
        ) : null}

        <section className="mt-3 grid gap-2" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
          <div className="overflow-hidden rounded-xl border border-[#D6EEE4] bg-[#E9F8F1]"><MetricCard icon={FolderKanban} label="Proyectos" value={integer.format(metrics.nonCompletedProjects.length)} detail={`${integer.format(metrics.completedProjects.length)} completados en total`} accent="success" onClick={() => navigate("/employee/projects")} /></div>
          <div className="overflow-hidden rounded-xl border border-[#D6EEE4] bg-[#E9F8F1]"><MetricCard icon={Zap} label="Automatizaciones" value={integer.format(metrics.activeAutomations.length)} detail={`${integer.format(metrics.totalAutomations)} configuradas`} accent="success" onClick={() => navigate("/employee/automations")} /></div>
          <div className={`overflow-hidden rounded-xl border ${metrics.runErrors.length ? "border-[#F3D0CC] bg-[#FFF1EF]" : "border-[#D6EEE4] bg-[#E9F8F1]"}`}><MetricCard icon={XCircle} label="Errores" value={integer.format(metrics.runErrors.length)} detail={`${integer.format(metrics.runsInPeriod.length)} ejecuciones en el periodo`} accent={metrics.runErrors.length ? "danger" : "success"} onClick={() => permissions["logs.read"] && navigate("/employee/logs")} /></div>
          <div className="overflow-hidden rounded-xl border border-[#F4E5C5] bg-[#FFF7E7]"><MetricCard icon={Ticket} label="Soporte abierto" value={integer.format(metrics.openTickets.length)} detail={`${integer.format(metrics.urgentTickets.length)} de prioridad alta`} onClick={() => permissions["support.read"] && navigate("/employee/support")} /></div>
          <div className="overflow-hidden rounded-xl border border-[#E1D9F5] bg-[#F1EDFF]"><MetricCard icon={ListTodo} label="Tareas pendientes" value={integer.format(metrics.pendingTasks.length)} detail={`${integer.format(metrics.urgentTasks.length)} de prioridad alta`} onClick={() => navigate(taskMode === "internal" ? "/employee/tasks" : "/employee/project-tasks")} /></div>
        </section>

        <section className="mt-3 grid items-stretch gap-2.5" style={{ gridTemplateColumns: "1.48fr 0.82fr 0.90fr" }}>
          <div className="h-[350px] overflow-hidden rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="flex items-end justify-between gap-3">
              <div><p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#96A0AE]">Automatización</p><h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#18212F]">Actividad de ejecuciones</h2></div>
              {permissions["automations.read"] ? <button onClick={() => navigate("/employee/automations/runs")} className="text-[10px] font-semibold text-[#4B8FE2] hover:text-[#2F76C7]">Ver detalle</button> : null}
            </div>
            <div className="mt-3 border-t border-[#EEF1F4]">
              {latestRuns.length ? latestRuns.map((run) => {
                const automation = run.automation_id ? automationMap.get(run.automation_id) : null;
                const duration = Number(run.duracion_ms ?? 0);
                return <div key={run.id} className="flex items-center gap-2 border-b border-[#EEF1F4] py-2.5 last:border-b-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F3F5F7]"><Zap className="h-3.5 w-3.5 text-[#697588]" strokeWidth={1.7} /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold text-[#354154]">{automation?.nombre || "Automatización"}</p><p className="mt-0.5 truncate text-[9px] text-[#9099A7]">{run.created_at ? formatDistanceToNow(new Date(run.created_at), { addSuffix: true, locale: es }) : "—"}</p></div>
                  <span className="shrink-0 text-[9px] font-semibold text-[#697588]">{normalizeStatus(run.estado).replaceAll("_", " ") || "—"}</span>
                  <span className="shrink-0 text-[9px] text-[#9099A7]">{duration ? `${Math.round(duration)} ms` : "—"}</span>
                </div>;
              }) : <div className="py-8 text-[10px] text-[#8B95A4]">Todavía no hay ejecuciones registradas.</div>}
            </div>
          </div>

          <div className="h-[350px] overflow-hidden rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div><p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#96A0AE]">Proyectos</p><h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#18212F]">Estado de proyectos</h2></div>
            <div className="mt-4 space-y-3">
              {[['En curso', metrics.statusCounts.active, 'bg-[#4B8FE2]'], ['Pausados', metrics.statusCounts.paused, 'bg-[#D7A33D]'], ['Otros pendientes', metrics.statusCounts.other, 'bg-[#9AA4B2]']].map(([label, value, bar]) => <div key={String(label)}><div className="flex items-center justify-between text-[10px]"><span className="font-semibold text-[#4D5A6D]">{label}</span><span className="font-bold text-[#18212F]">{value}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#EEF1F4]"><div className={`h-full rounded-full ${bar}`} style={{ width: `${metrics.nonCompletedProjects.length ? Math.min(100, Number(value) / metrics.nonCompletedProjects.length * 100) : 0}%` }} /></div></div>)}
            </div>
            <div className="mt-5 border-t border-[#EEF1F4] pt-4"><p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#96A0AE]">Resumen</p><p className="mt-1 text-[11px] text-[#697588]">Total de proyectos no completados: <strong className="text-[#18212F]">{metrics.nonCompletedProjects.length}</strong></p><p className="mt-1 text-[10px] text-[#9099A7]">Completados: {metrics.completedProjects.length}</p></div>
          </div>

          <div className="h-[350px] overflow-hidden rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <div className="flex items-end justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#96A0AE]">Trazabilidad</p><h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-[#18212F]">Actividad reciente</h2></div><button onClick={() => navigate("/employee/activity")} className="text-[10px] font-semibold text-[#4B8FE2] hover:text-[#2F76C7]">Ver todo</button></div>
            <div className="mt-3 border-t border-[#EEF1F4]">{data.activity.length ? data.activity.slice(0, 8).map((item) => <button key={item.id} type="button" onClick={() => navigate("/employee/activity")} className="flex w-full items-center gap-2 border-b border-[#EEF1F4] py-2 text-left last:border-b-0"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F3F5F7]"><Activity className="h-3.5 w-3.5 text-[#697588]" strokeWidth={1.7} /></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-[#354154]">{item.description || item.action || "Actividad"}</span><span className="mt-0.5 block truncate text-[9px] text-[#9099A7]">{item.resource_type || "recurso"} · {item.created_at ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: es }) : "—"}</span></span></button>) : <div className="py-8 text-[10px] text-[#8B95A4]">No hay actividad reciente.</div>}</div>
          </div>
        </section>

        <section className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader eyebrow="Seguimiento técnico" title="Requiere atención" description="Elementos técnicos que pueden requerir revisión o seguimiento." />
            <div className="mt-3 border-t border-[#EEF1F4]">
              {latestErrors.length || metrics.urgentTickets.length || metrics.urgentTasks.length ? <>
                {latestErrors.slice(0, 3).map((run) => <button key={`error-${run.id}`} type="button" onClick={() => permissions["logs.read"] && navigate(`/employee/logs?run=${run.id}`)} className="flex w-full items-center gap-2 border-b border-[#EEF1F4] py-2.5 text-left"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFF0EE]"><XCircle className="h-3.5 w-3.5 text-[#B42318]" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-[#354154]">{automationMap.get(run.automation_id || "")?.nombre || "Error de automatización"}</span><span className="block truncate text-[9px] text-[#B42318]">{run.error || "La ejecución terminó con error."}</span></span><span className="text-[9px] font-semibold text-[#B42318]">Error</span></button>)}
                {metrics.urgentTickets.slice(0, 2).map((ticket) => <button key={`ticket-${ticket.id}`} type="button" onClick={() => permissions["support.read"] && navigate(`/employee/support/${ticket.id}`)} className="flex w-full items-center gap-2 border-b border-[#EEF1F4] py-2.5 text-left"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FFF7E7]"><Ticket className="h-3.5 w-3.5 text-[#A46B0A]" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-[#354154]">{ticket.titulo || "Ticket"}</span><span className="block truncate text-[9px] text-[#9099A7]">Soporte · prioridad {ticket.prioridad || "alta"}</span></span><span className="text-[9px] font-semibold text-[#A46B0A]">Revisar</span></button>)}
                {metrics.urgentTasks.slice(0, 2).map((task) => <button key={`task-${task.id}`} type="button" onClick={() => navigate(taskMode === "internal" ? `/employee/tasks/${task.id}` : `/employee/project-tasks/${task.id}`)} className="flex w-full items-center gap-2 border-b border-[#EEF1F4] py-2.5 text-left"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F1EDFF]"><ListTodo className="h-3.5 w-3.5 text-[#6E5BAA]" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-[#354154]">{task.title || "Tarea"}</span><span className="block truncate text-[9px] text-[#9099A7]">Tarea {taskMode === "internal" ? "interna" : "de proyecto"} · prioridad {task.priority || "alta"}</span></span><span className="text-[9px] font-semibold text-[#6E5BAA]">Revisar</span></button>)}
              </> : <div className="py-8 text-[10px] text-[#8B95A4]">No hay elementos que requieran atención.</div>}
            </div>
          </div>

          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader eyebrow="Trabajo pendiente" title="Tareas" description="Solo tareas asignadas al developer que ha iniciado sesión." />
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#EEF1F4] pt-3">
              <div className="flex rounded-lg bg-[#F4F5F7] p-0.5">
                <button type="button" onClick={() => setTaskMode("internal")} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${taskMode === "internal" ? "bg-white text-[#354154] shadow-[0_1px_2px_rgba(16,24,40,0.06)]" : "text-[#8994A4]"}`}>Tareas internas</button>
                <button type="button" onClick={() => setTaskMode("project")} className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold ${taskMode === "project" ? "bg-white text-[#354154] shadow-[0_1px_2px_rgba(16,24,40,0.06)]" : "text-[#8994A4]"}`}>Tareas de proyectos</button>
              </div>
              <button type="button" onClick={() => navigate(taskMode === "internal" ? "/employee/tasks" : "/employee/project-tasks")} className="text-[10px] font-semibold text-[#4B8FE2] hover:text-[#2F76C7]">Ver todo</button>
            </div>
            <div className="mt-1 border-t border-[#EEF1F4]">
              {dashboardTasks.length ? dashboardTasks.map((task) => {
                const due = task.due_at ? new Date(task.due_at) : null;
                const validDue = due && !Number.isNaN(due.getTime()) ? due : null;
                const overdue = Boolean(validDue && isBefore(validDue, startOfDay(new Date())));
                const project = task.project_id ? data.projects.find((item) => item.id === task.project_id) : null;
                const status = normalizeStatus(task.status);
                const statusLabel = status === "pending_review" ? "Pendiente de revisión" : status === "in_progress" ? "En curso" : "Por hacer";
                return <button key={task.id} type="button" onClick={() => navigate(taskMode === "internal" ? `/employee/tasks/${task.id}` : `/employee/project-tasks/${task.id}`)} className="group flex w-full items-center gap-3 border-b border-[#EEF1F4] py-3 text-left last:border-b-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3F5F7]"><ListTodo className="h-4 w-4 text-[#657287]" strokeWidth={1.7} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[#354154]">{task.title || "Tarea"}</span><span className="mt-0.5 block truncate text-[10px] text-[#9099A7]">{taskMode === "project" ? `${project?.nombre || "Proyecto"} · ` : ""}{statusLabel}{task.progress != null ? ` · ${Math.round(Number(task.progress))}%` : ""}</span></span>
                  {validDue ? <span className={`shrink-0 text-[10px] font-semibold ${overdue ? "text-[#B42318]" : "text-[#697588]"}`}>{overdue ? "Vencida" : format(validDue, "d MMM", { locale: es })}</span> : null}
                </button>;
              }) : <div className="py-7 text-[10px] text-[#8B95A4]">No tienes tareas pendientes en esta categoría.</div>}
            </div>
          </div>

          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader eyebrow="Planificación" title="Próximos hitos" description="Elementos técnicos que requieren atención próximamente." />
            <div className="mt-3 border-t border-[#EEF1F4]">{metrics.upcomingMilestones.length ? metrics.upcomingMilestones.slice(0, 6).map((milestone) => { const date = milestone.fecha_prevista ? new Date(milestone.fecha_prevista) : null; const project = data.projects.find((item) => item.id === milestone.project_id); return <button key={milestone.id} type="button" onClick={() => milestone.project_id && navigate(`/employee/projects/${milestone.project_id}`)} className="flex w-full items-center gap-3 border-b border-[#EEF1F4] py-3 text-left last:border-b-0"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F3F5F7]"><Flag className="h-4 w-4 text-[#697588]" strokeWidth={1.7} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[#354154]">{milestone.nombre || "Hito"}</span><span className="mt-0.5 block truncate text-[10px] text-[#9099A7]">{project?.nombre || "Proyecto"}</span></span><span className="shrink-0 text-[10px] font-semibold text-[#697588]">{date && !Number.isNaN(date.getTime()) ? format(date, "d MMM", { locale: es }) : "—"}</span></button>; }) : <div className="py-7 text-[10px] text-[#8B95A4]">No hay hitos próximos.</div>}</div>
          </div>

          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader eyebrow="Proyectos" title="Proyectos en curso" description="Seguimiento operativo y progreso de los proyectos técnicos." action={<button onClick={() => navigate("/employee/projects")} className="text-[10px] font-semibold text-[#4B8FE2] hover:text-[#2F76C7]">Ver todos</button>} />
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#E1E5EA] bg-[#F8F9FA] px-2.5 py-2"><Search className="h-3.5 w-3.5 text-[#9AA3B0]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar proyecto…" className="w-full bg-transparent text-[10px] outline-none placeholder:text-[#A0A8B3]" /></div>
            <div className="border-t border-[#EEF1F4]">{projectProgress.length ? projectProgress.map(({ project, progress }) => <button key={project.id} type="button" onClick={() => navigate(`/employee/projects/${project.id}`)} className="w-full border-b border-[#EEF1F4] py-3 text-left last:border-b-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-[#354154]">{project.nombre || "Proyecto sin nombre"}</p><p className="mt-0.5 line-clamp-1 text-[9px] text-[#9099A7]">{project.descripcion || "Sin descripción"}</p></div><StatusPill status={project.estado} /></div><div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEF1F4]"><div className="h-full rounded-full bg-[#4B8FE2]" style={{ width: `${Math.max(0, Math.min(100, Number(progress) || 0))}%` }} /></div><span className="w-9 text-right text-[9px] font-bold text-[#697588]">{Math.round(Number(progress) || 0)}%</span></div></button>) : <div className="py-7 text-[10px] text-[#8B95A4]">No hay proyectos pendientes que mostrar.</div>}</div>
          </div>
        </section>

        <section className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: "1fr 0.9fr 0.9fr" }}>
          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader eyebrow="Automatizaciones" title="Workflows activos" description="Estado de las automatizaciones disponibles para el equipo técnico." />
            <div className="grid gap-2 sm:grid-cols-2">{data.automations.length ? data.automations.slice(0, 8).map((automation) => <button key={automation.id} type="button" onClick={() => permissions["automations.read"] && navigate(`/employee/automations/${automation.id}`)} className="rounded-lg border border-[#EEF1F4] bg-[#FAFBFC] p-3 text-left hover:border-[#E0E4E9] hover:bg-white"><div className="flex items-center justify-between gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F3F5F7]"><Zap className="h-3.5 w-3.5 text-[#657287]" /></span><StatusPill status={automation.estado} /></div><p className="mt-2 truncate text-[10px] font-semibold text-[#354154]">{automation.nombre || "Automatización"}</p><p className="mt-0.5 line-clamp-2 text-[9px] leading-4 text-[#9099A7]">{automation.descripcion || "Sin descripción"}</p></button>) : <div className="py-7 text-[10px] text-[#8B95A4]">No hay automatizaciones disponibles.</div>}</div>
          </div>

          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader eyebrow="IA" title="Uso técnico" description="Resumen seguro del uso de IA." />
            {permissions["ai.read"] || permissions["ai.use"] || permissions["ai.manage"] ? <><div className="rounded-lg bg-[#18212F] p-4 text-white"><div className="flex items-center justify-between"><Bot className="h-4 w-4 text-[#C4CBD4]" /><span className="text-[9px] font-semibold text-[#9AA4B1]">Coste real acumulado</span></div><p className="mt-4 text-[22px] font-semibold tracking-[-0.04em]">{euro.format(aiCost)}</p><p className="mt-1 text-[9px] text-[#9AA4B1]">Según el panel seguro de IA</p></div><div className="mt-2 grid grid-cols-2 gap-2"><div className="rounded-lg bg-[#F6F7F8] p-3"><p className="text-[9px] text-[#8B95A4]">Reservas</p><p className="mt-1 text-[14px] font-semibold">{integer.format(aiSummary?.total_reservations ?? 0)}</p></div><div className="rounded-lg bg-[#F6F7F8] p-3"><p className="text-[9px] text-[#8B95A4]">Activas</p><p className="mt-1 text-[14px] font-semibold">{integer.format(aiSummary?.active_reservations ?? 0)}</p></div><div className="rounded-lg bg-[#F6F7F8] p-3"><p className="text-[9px] text-[#8B95A4]">Input</p><p className="mt-1 text-[14px] font-semibold">{integer.format(aiSummary?.total_input_tokens_real ?? 0)}</p></div><div className="rounded-lg bg-[#F6F7F8] p-3"><p className="text-[9px] text-[#8B95A4]">Output</p><p className="mt-1 text-[14px] font-semibold">{integer.format(aiSummary?.total_output_tokens_real ?? 0)}</p></div></div><button onClick={() => navigate("/employee/ai")} className="mt-2 flex w-full items-center justify-between rounded-lg border border-[#E0E4E9] px-3 py-2 text-[10px] font-semibold text-[#5F6C7E] hover:bg-[#F8F9FA]">Abrir panel de IA <ArrowUpRight className="h-3.5 w-3.5" /></button></> : <div className="py-7 text-[10px] text-[#8B95A4]">El rol no tiene acceso al panel de IA.</div>}
          </div>

          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader eyebrow="Soporte" title="Tickets abiertos" description="Incidencias operativas visibles para el equipo técnico." />
            <div className="border-t border-[#EEF1F4]">{metrics.openTickets.length ? metrics.openTickets.slice(0, 7).map((ticket) => <button key={ticket.id} type="button" onClick={() => permissions["support.read"] && navigate(`/employee/support/${ticket.id}`)} className="flex w-full items-center gap-2 border-b border-[#EEF1F4] py-2.5 text-left last:border-b-0"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F3F5F7]"><Ticket className="h-3.5 w-3.5 text-[#697588]" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-semibold text-[#354154]">{ticket.titulo || "Ticket"}</span><span className="mt-0.5 flex items-center gap-2"><StatusPill status={ticket.estado} /><span className="text-[9px] text-[#9099A7]">{ticket.prioridad || "normal"}</span></span></span></button>) : <div className="py-7 text-[10px] text-[#8B95A4]">No hay tickets abiertos.</div>}</div>
          </div>
        </section>

        <section className="mt-3 grid gap-2.5" style={{ gridTemplateColumns: "1.15fr 0.85fr" }}>
          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader eyebrow="Sistema técnico" title="Accesos" description="Herramientas disponibles según los permisos efectivos del developer." />
<div className="grid gap-2 sm:grid-cols-2">
  {[
    {
      label: "Proyectos",
      permission: "projects.read",
      route: "/employee/projects",
      Icon: FolderKanban,
    },
    {
      label: "Automatizaciones",
      permission: "automations.read",
      route: "/employee/automations",
      Icon: Zap,
    },
    {
      label: "Error Logs",
      permission: "logs.read",
      route: "/employee/logs",
      Icon: ShieldAlert,
    },
    {
      label: "Webhooks",
      permission: "webhooks.read",
      route: "/employee/webhooks",
      Icon: GitBranch,
    },
    {
      label: "IA",
      permission: "ai.read",
      route: "/employee/ai",
      Icon: Bot,
    },
    {
      label: "Soporte",
      permission: "support.read",
      route: "/employee/support",
      Icon: Ticket,
    },
  ].map((item) => {
    const allowed = permissions[item.permission];
    const Icon = item.Icon;

    return (
      <button
        key={item.label}
        type="button"
        disabled={!allowed}
        onClick={() => allowed && navigate(item.route)}
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
          allowed
            ? "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
            : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0 text-slate-600" />
        <span className="text-sm font-medium text-slate-800">
          {item.label}
        </span>
      </button>
    );
  })}
</div>
            <div className="mt-3 rounded-lg border border-[#EEF1F4] bg-[#F8F9FA] p-3"><div className="flex items-start gap-2"><Wrench className="mt-0.5 h-3.5 w-3.5 text-[#697588]" /><div><p className="text-[10px] font-semibold text-[#4D5A6D]">Capacidades del rol</p><p className="mt-1 text-[9px] leading-4 text-[#8B95A4]">Las acciones se muestran según los permisos efectivos del developer. La autorización real continúa en RPC/RLS.</p></div></div></div>
          </div>

          <div className="rounded-[10px] border border-[#E1E5EA] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <SectionHeader eyebrow="Resumen" title="Estado técnico" description="Indicadores del periodo seleccionado." />
            <div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-[#F8F9FA] p-3"><p className="text-[9px] text-[#8B95A4]">Correctas</p><p className="mt-1 text-[17px] font-semibold">{metrics.automationSuccessRate}%</p><p className="text-[9px] text-[#9099A7]">del periodo</p></div><div className="rounded-lg bg-[#F8F9FA] p-3"><p className="text-[9px] text-[#8B95A4]">En ejecución</p><p className="mt-1 text-[17px] font-semibold">{integer.format(metrics.running)}</p><p className="text-[9px] text-[#9099A7]">ahora mismo</p></div><div className="rounded-lg bg-[#F8F9FA] p-3"><p className="text-[9px] text-[#8B95A4]">Pendientes</p><p className="mt-1 text-[17px] font-semibold">{integer.format(metrics.pendingRuns)}</p><p className="text-[9px] text-[#9099A7]">esperando ejecución</p></div><div className="rounded-lg bg-[#F8F9FA] p-3"><p className="text-[9px] text-[#8B95A4]">Hitos</p><p className="mt-1 text-[17px] font-semibold">{integer.format(metrics.upcomingMilestones.length)}</p><p className="text-[9px] text-[#9099A7]">próximos 14 días</p></div></div>
          </div>
        </section>

        <footer className="mt-5 flex flex-col justify-between gap-2 border-t border-[#E1E5EA] px-1 pt-4 text-[9px] text-[#9AA3AE] sm:flex-row">
          <span>Modira · Centro técnico</span>
          <span>Actualizado {format(new Date(), "d MMM yyyy, HH:mm", { locale: es })}</span>
        </footer>
      </div>
    </div>
  );
}
