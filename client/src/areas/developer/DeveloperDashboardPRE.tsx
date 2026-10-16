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
  Code2,
  ExternalLink,
  Flag,
  FolderKanban,
  GitBranch,
  Loader2,
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
        });
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
    const activeProjects = data.projects.filter((p) => {
      const status = normalizeStatus(p.estado);
      return status === "activo" || status === "en_curso" || status === "active";
    });

    const completedProjects = data.projects.filter((p) => {
      const status = normalizeStatus(p.estado);
      return status === "completado" || status === "completed";
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

    return {
      activeProjects,
      completedProjects,
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
    };
  }, [data, range]);

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return metrics.activeProjects.slice(0, 8);
    return metrics.activeProjects
      .filter((p) => `${p.nombre ?? ""} ${p.descripcion ?? ""}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [metrics.activeProjects, search]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] px-6 py-10">
        <div className="mx-auto flex min-h-[70vh] max-w-[1540px] items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Cargando dashboard técnico…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-900">
      <div className="mx-auto max-w-[1540px] px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-7 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Modira · Developer</p>
              <h1 className="text-xl font-bold tracking-tight">Centro técnico</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/employee/notifications")}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Notificaciones"
            >
              <Bell className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void loadDashboard(true)}
              disabled={refreshing}
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </button>
            <div className="hidden h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                {(data.workerName || "D").slice(0, 1).toUpperCase()}
              </div>
              <span className="max-w-[150px] truncate text-sm font-semibold text-slate-700">{data.workerName}</span>
            </div>
          </div>
        </header>

        <section className="mb-7 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_16px_50px_rgba(15,23,42,0.05)] sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                <ServerCog className="h-3.5 w-3.5" />
                Operaciones técnicas
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Todo lo técnico, en un solo lugar.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
                Supervisa proyectos, automatizaciones, ejecuciones, errores, soporte e IA desde una vista pensada para el trabajo de desarrollo y automatización.
              </p>
            </div>
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setPeriodOpen((value) => !value)}
                className="flex min-w-[190px] items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm"
              >
                {PERIODS.find((item) => item.value === period)?.label}
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {periodOpen && (
                <div className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  {PERIODS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => {
                        setPeriod(item.value);
                        setPeriodOpen(false);
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm ${period === item.value ? "bg-slate-900 font-semibold text-white" : "text-slate-600 hover:bg-slate-50"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {warning && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{warning}</span>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={FolderKanban}
            label="Proyectos activos"
            value={integer.format(metrics.activeProjects.length)}
            detail={`${integer.format(metrics.completedProjects.length)} completados en total`}
          />
          <KpiCard
            icon={Zap}
            label="Automatizaciones"
            value={integer.format(metrics.activeAutomations.length)}
            detail={`${integer.format(metrics.totalAutomations)} configuradas`}
            tone="success"
          />
          <KpiCard
            icon={XCircle}
            label="Errores de ejecución"
            value={integer.format(metrics.runErrors.length)}
            detail={`${integer.format(metrics.runsInPeriod.length)} ejecuciones en el periodo`}
            tone={metrics.runErrors.length ? "danger" : "success"}
          />
          <KpiCard
            icon={Ticket}
            label="Soporte abierto"
            value={integer.format(metrics.openTickets.length)}
            detail={`${integer.format(metrics.urgentTickets.length)} de prioridad alta`}
            tone={metrics.urgentTickets.length ? "warning" : "default"}
          />
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Ejecuciones correctas", `${metrics.automationSuccessRate}%`, "Tasa del periodo", CheckCircle2],
            ["En ejecución", integer.format(metrics.running), "Ahora mismo", Loader2],
            ["Pendientes", integer.format(metrics.pendingRuns), "Esperando ejecución", Clock3],
            ["Hitos próximos", integer.format(metrics.upcomingMilestones.length), "Próximos 14 días", Flag],
          ].map(([label, value, detail, Icon]) => (
            <div key={String(label)} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-xs font-semibold text-slate-400">{label}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-500">{detail}</p>
              </div>
              <Icon className="h-5 w-5 text-slate-300" />
            </div>
          ))}
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.9fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
            <SectionHeader
              eyebrow="Proyectos"
              title="Proyectos activos"
              description="Seguimiento operativo y progreso de los proyectos técnicos."
              action={
                permissions["projects.read"] ? (
                  <button onClick={() => navigate("/employee/projects")} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-950">
                    Ver todos <ArrowRight className="h-4 w-4" />
                  </button>
                ) : null
              }
            />
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar proyecto…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
              />
            </div>
            {projectProgress.length ? (
              <div className="space-y-3">
                {projectProgress.map(({ project, progress }) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => navigate(`/employee/projects/${project.id}`)}
                    className="w-full rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-left transition hover:border-slate-200 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">{project.nombre || "Proyecto sin nombre"}</p>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">{project.descripcion || "Sin descripción"}</p>
                      </div>
                      <StatusPill status={project.estado} />
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${Math.max(0, Math.min(100, Number(progress) || 0))}%` }} />
                      </div>
                      <span className="w-10 text-right text-xs font-bold text-slate-600">{Math.round(Number(progress) || 0)}%</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={FolderKanban} text="No hay proyectos activos que mostrar." />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
            <SectionHeader eyebrow="Planificación" title="Próximos hitos" description="Elementos técnicos que requieren atención próximamente." />
            {metrics.upcomingMilestones.length ? (
              <div className="space-y-2">
                {metrics.upcomingMilestones.slice(0, 7).map((milestone) => {
                  const date = milestone.fecha_prevista ? new Date(milestone.fecha_prevista) : null;
                  const project = data.projects.find((item) => item.id === milestone.project_id);
                  return (
                    <button key={milestone.id} type="button" onClick={() => milestone.project_id && navigate(`/employee/projects/${milestone.project_id}`)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Flag className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{milestone.nombre || "Hito"}</p>
                        <p className="truncate text-xs text-slate-500">{project?.nombre || "Proyecto"}</p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-slate-500">{date && format(date, "d MMM", { locale: es })}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={Flag} text="No hay hitos próximos." />
            )}
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
            <SectionHeader
              eyebrow="Automatización"
              title="Actividad de ejecuciones"
              description="Historial reciente y estado de los workflows."
              action={permissions["automations.read"] ? <button onClick={() => navigate("/employee/automations/runs")} className="text-sm font-semibold text-slate-700 hover:text-slate-950">Ver ejecuciones</button> : null}
            />
            {latestRuns.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px] text-left">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                      <th className="pb-3 font-semibold">Automatización</th>
                      <th className="pb-3 font-semibold">Estado</th>
                      <th className="pb-3 text-right font-semibold">Tiempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestRuns.map((run) => {
                      const automation = run.automation_id ? automationMap.get(run.automation_id) : null;
                      const duration = Number(run.duracion_ms ?? 0);
                      return (
                        <tr key={run.id} className="border-b border-slate-50 last:border-0">
                          <td className="py-3 pr-4">
                            <p className="max-w-[270px] truncate text-sm font-semibold text-slate-800">{automation?.nombre || "Automatización"}</p>
                            <p className="mt-0.5 text-xs text-slate-400">{run.created_at ? formatDistanceToNow(new Date(run.created_at), { addSuffix: true, locale: es }) : "—"}</p>
                          </td>
                          <td className="py-3"><StatusPill status={run.estado} /></td>
                          <td className="py-3 text-right text-xs font-medium text-slate-500">{duration ? `${Math.round(duration)} ms` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon={Zap} text="Todavía no hay ejecuciones registradas." />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
            <SectionHeader
              eyebrow="Incidencias"
              title="Errores recientes"
              description="Fallos de automatización que requieren revisión."
              action={permissions["logs.read"] ? <button onClick={() => navigate("/employee/logs")} className="text-sm font-semibold text-slate-700 hover:text-slate-950">Error logs</button> : null}
            />
            {latestErrors.length ? (
              <div className="space-y-3">
                {latestErrors.map((run) => {
                  const automation = run.automation_id ? automationMap.get(run.automation_id) : null;
                  return (
                    <button key={run.id} type="button" onClick={() => permissions["logs.read"] && navigate(`/employee/logs?run=${run.id}`)} className="w-full rounded-xl border border-red-100 bg-red-50/50 p-4 text-left transition hover:bg-red-50">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700"><XCircle className="h-4 w-4" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-800">{automation?.nombre || "Ejecución de automatización"}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-red-700">{run.error || "La ejecución terminó con estado de error."}</p>
                          <p className="mt-2 text-[11px] text-slate-400">{run.created_at ? formatDistanceToNow(new Date(run.created_at), { addSuffix: true, locale: es }) : "—"}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} text="No hay errores recientes de automatización." />
            )}
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr_0.8fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
            <SectionHeader eyebrow="Automatizaciones" title="Workflows activos" description="Estado de las automatizaciones disponibles para el equipo técnico." />
            {data.automations.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {data.automations.slice(0, 8).map((automation) => (
                  <button key={automation.id} type="button" onClick={() => permissions["automations.read"] && navigate(`/employee/automations/${automation.id}`)} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-left transition hover:border-slate-200 hover:bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white"><Zap className="h-4 w-4" /></div>
                      <StatusPill status={automation.estado} />
                    </div>
                    <p className="mt-3 truncate text-sm font-bold text-slate-800">{automation.nombre || "Automatización"}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{automation.descripcion || "Sin descripción"}</p>
                    {automation.frecuencia && <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{automation.frecuencia}</p>}
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={Zap} text="No hay automatizaciones disponibles." />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
            <SectionHeader eyebrow="IA" title="Uso técnico" description="Resumen del panel de IA del trabajador." />
            {permissions["ai.read"] || permissions["ai.use"] || permissions["ai.manage"] ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-900 p-5 text-white">
                  <div className="flex items-center justify-between">
                    <Bot className="h-5 w-5 text-slate-300" />
                    <span className="text-xs font-semibold text-slate-400">Coste real acumulado</span>
                  </div>
                  <p className="mt-5 text-2xl font-bold">{euro.format(aiCost)}</p>
                  <p className="mt-1 text-xs text-slate-400">Según el panel seguro de IA</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs text-slate-400">Reservas</p><p className="mt-1 text-lg font-bold">{integer.format(aiSummary?.total_reservations ?? 0)}</p></div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs text-slate-400">Activas</p><p className="mt-1 text-lg font-bold">{integer.format(aiSummary?.active_reservations ?? 0)}</p></div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs text-slate-400">Input tokens</p><p className="mt-1 text-lg font-bold">{integer.format(aiSummary?.total_input_tokens_real ?? 0)}</p></div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs text-slate-400">Output tokens</p><p className="mt-1 text-lg font-bold">{integer.format(aiSummary?.total_output_tokens_real ?? 0)}</p></div>
                </div>
                <button onClick={() => navigate("/employee/ai")} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Abrir panel de IA <ArrowUpRight className="h-4 w-4" /></button>
              </div>
            ) : (
              <EmptyState icon={Bot} text="El rol no tiene acceso al panel de IA." />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
            <SectionHeader eyebrow="Soporte" title="Tickets abiertos" description="Incidencias operativas visibles para el equipo técnico." />
            {metrics.openTickets.length ? (
              <div className="space-y-2">
                {metrics.openTickets.slice(0, 7).map((ticket) => (
                  <button key={ticket.id} type="button" onClick={() => permissions["support.read"] && navigate(`/employee/support/${ticket.id}`)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Ticket className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{ticket.titulo || "Ticket"}</p>
                      <div className="mt-1 flex items-center gap-2"><StatusPill status={ticket.estado} /><span className="text-[11px] text-slate-400">{ticket.prioridad || "normal"}</span></div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={CheckCircle2} text="No hay tickets abiertos." />
            )}
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
            <SectionHeader eyebrow="Actividad" title="Actividad técnica reciente" description="Últimas acciones registradas en el CRM." action={<button onClick={() => navigate("/employee/activity")} className="text-sm font-semibold text-slate-700 hover:text-slate-950">Ver actividad</button>} />
            {data.activity.length ? (
              <div className="space-y-1">
                {data.activity.slice(0, 8).map((item) => (
                  <div key={item.id} className="flex items-start gap-3 rounded-xl p-3 hover:bg-slate-50">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Activity className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-700">{item.description || item.action || "Actividad"}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.resource_type || "recurso"}{item.created_at ? ` · ${formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: es })}` : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Activity} text="No hay actividad reciente." />
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
            <SectionHeader eyebrow="Sistema técnico" title="Accesos" description="Herramientas disponibles según los permisos efectivos del trabajador." />
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["Proyectos", "projects.read", "/employee/projects", FolderKanban],
                ["Automatizaciones", "automations.read", "/employee/automations", Zap],
                ["Error Logs", "logs.read", "/employee/logs", ShieldAlert],
                ["Webhooks", "webhooks.read", "/employee/webhooks", GitBranch],
                ["IA", "ai.read", "/employee/ai", Bot],
                ["Soporte", "support.read", "/employee/support", Ticket],
              ].map(([label, permission, route, Icon]) => {
                const allowed = permissions[String(permission)];
                return (
                  <button
                    key={String(label)}
                    type="button"
                    disabled={!allowed}
                    onClick={() => allowed && navigate(String(route))}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${allowed ? "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50" : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-45"}`}
                  >
                    <span className="flex items-center gap-3"><Icon className="h-4 w-4 text-slate-500" /><span className="text-sm font-semibold text-slate-700">{label}</span></span>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-300" />
                  </button>
                );
              })}
            </div>
            <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <Wrench className="mt-0.5 h-4 w-4 text-slate-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">Capacidades del rol</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Las acciones de creación, edición, eliminación y ejecución se muestran únicamente cuando existe el permiso correspondiente. La autorización efectiva continúa en RPC/RLS.</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-slate-200 px-1 pt-5 text-xs text-slate-400 sm:flex-row">
          <span>Modira · Centro técnico</span>
          <span>Actualizado {format(new Date(), "d MMM yyyy, HH:mm", { locale: es })}</span>
        </footer>
      </div>
    </div>
  );
}
