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
  CheckCircle2,
  ChevronDown,
  Clock3,
  ExternalLink,
  FolderKanban,
  Headphones,
  LifeBuoy,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Ticket,
  Users,
  XCircle,
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
  | "support.read"
  | "support.create"
  | "support.update"
  | "support.delete"
  | "clients.read"
  | "projects.read";

type TicketRow = {
  id: string;
  titulo?: string | null;
  descripcion?: string | null;
  estado?: string | null;
  prioridad?: string | null;
  user_id?: string | null;
  company_id?: string | null;
  fecha_cierre?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ClientRow = {
  id: string;
  nombre?: string | null;
  empresa?: string | null;
  email?: string | null;
  company_id?: string | null;
  estado?: string | null;
  created_at?: string | null;
};

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

type ActivityRow = {
  id: string;
  action?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  description?: string | null;
  created_at?: string | null;
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

function isInside(value: string | null | undefined, start: Date, end: Date) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= start && date <= end;
}

function StatusPill({ status }: { status: string | null | undefined }) {
  const value = normalizeStatus(status);
  const config =
    value === "cerrado" || value === "cancelado"
      ? { label: value, className: "bg-emerald-50 text-emerald-700 border-emerald-100" }
      : value === "abierto" || value === "pendiente" || value === "nuevo"
        ? { label: value || "abierto", className: "bg-amber-50 text-amber-700 border-amber-100" }
        : value === "en_proceso" || value === "en curso" || value === "en_curso"
          ? { label: value, className: "bg-blue-50 text-blue-700 border-blue-100" }
          : { label: value || "—", className: "bg-slate-50 text-slate-600 border-slate-100" };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${config.className}`}>
      {config.label.replaceAll("_", " ")}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string | null | undefined }) {
  const value = normalizeStatus(priority);
  const config =
    value === "alta" || value === "urgente" || value === "critical"
      ? { label: value || "alta", className: "bg-red-50 text-red-700 border-red-100" }
      : value === "media" || value === "normal"
        ? { label: value || "media", className: "bg-amber-50 text-amber-700 border-amber-100" }
        : { label: value || "baja", className: "bg-slate-50 text-slate-600 border-slate-100" };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${config.className}`}>
      {config.label}
    </span>
  );
}

function SectionTitle({ icon: Icon, title, description, action }: { icon: typeof Activity; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#102A66]/[0.07] text-[#102A66]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, detail, tone = "blue" }: { icon: typeof Activity; label: string; value: string | number; detail: string; tone?: "blue" | "amber" | "green" | "red" }) {
  const tones = {
    blue: "bg-[#102A66]/[0.07] text-[#102A66]",
    amber: "bg-amber-50 text-amber-700",
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{detail}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Activity; title: string; description: string }) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

export default function SupportDashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [permissions, setPermissions] = useState<Record<PermissionCode, boolean>>({
    "support.read": false,
    "support.create": false,
    "support.update": false,
    "support.delete": false,
    "clients.read": false,
    "projects.read": false,
  });
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  const range = useMemo(() => getPeriodRange(period), [period]);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const permissionCodes = Object.keys(permissions) as PermissionCode[];
      const permissionResults = await Promise.all(
        permissionCodes.map(async (code) => {
          const { data, error: permissionError } = await supabase.rpc("current_worker_has_permission", {
            p_permission_code: code,
          });
          if (permissionError) throw permissionError;
          return [code, Boolean(data)] as const;
        }),
      );
      const resolvedPermissions = Object.fromEntries(permissionResults) as Record<PermissionCode, boolean>;
      setPermissions(resolvedPermissions);

      const [ticketsResult, clientsResult, projectsResult, activityResult] = await Promise.all([
        resolvedPermissions["support.read"]
          ? supabase
              .from("support_tickets")
              .select("id, titulo, descripcion, estado, prioridad, user_id, company_id, fecha_cierre, created_at, updated_at")
              .order("updated_at", { ascending: false })
              .limit(250)
          : Promise.resolve({ data: [], error: null }),
        resolvedPermissions["clients.read"]
          ? supabase.from("clients").select("id, nombre, empresa, email, company_id, estado, created_at").order("created_at", { ascending: false }).limit(250)
          : Promise.resolve({ data: [], error: null }),
        resolvedPermissions["projects.read"]
          ? supabase.from("projects").select("id, nombre, descripcion, estado, company_id, fecha_inicio, fecha_fin, updated_at").order("updated_at", { ascending: false }).limit(250)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("activity_log").select("id, action, resource_type, resource_id, description, created_at").order("created_at", { ascending: false }).limit(12),
      ]);

      const firstError = [ticketsResult, clientsResult, projectsResult, activityResult].find((result) => result.error)?.error;
      if (firstError) throw firstError;

      setTickets((ticketsResult.data ?? []) as TicketRow[]);
      setClients((clientsResult.data ?? []) as ClientRow[]);
      setProjects((projectsResult.data ?? []) as ProjectRow[]);
      setActivity((activityResult.data ?? []) as ActivityRow[]);
    } catch (err) {
      console.error("Support dashboard error", err);
      setError(err instanceof Error ? err.message : "No se han podido cargar todos los datos del dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [permissions]);

  useEffect(() => {
    loadDashboard();
    // Initial permission/data load only; refresh button explicitly reloads it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizedSearch = search.trim().toLowerCase();

  const openTickets = useMemo(
    () => tickets.filter((ticket) => !["cerrado", "cancelado", "resuelto", "completed", "completado"].includes(normalizeStatus(ticket.estado))),
    [tickets],
  );

  const urgentTickets = useMemo(
    () => openTickets.filter((ticket) => ["alta", "urgente", "critical"].includes(normalizeStatus(ticket.prioridad))),
    [openTickets],
  );

  const periodCreatedTickets = useMemo(
    () => tickets.filter((ticket) => isInside(ticket.created_at, range.start, range.end)),
    [tickets, range],
  );

  const periodClosedTickets = useMemo(
    () => tickets.filter((ticket) => isInside(ticket.fecha_cierre ?? ticket.updated_at, range.start, range.end) && ["cerrado", "resuelto", "completado", "completado"].includes(normalizeStatus(ticket.estado))),
    [tickets, range],
  );

  const expiringProjects = useMemo(() => {
    const limit = addDays(new Date(), 14);
    return projects
      .filter((project) => project.fecha_fin && !isBefore(new Date(project.fecha_fin), new Date()) && new Date(project.fecha_fin) <= limit)
      .sort((a, b) => new Date(a.fecha_fin ?? 0).getTime() - new Date(b.fecha_fin ?? 0).getTime())
      .slice(0, 5);
  }, [projects]);

  const filteredTickets = useMemo(() => {
    return openTickets
      .filter((ticket) => {
        if (!normalizedSearch) return true;
        return [ticket.titulo, ticket.descripcion, ticket.estado, ticket.prioridad, ticket.company_id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      })
      .slice(0, 8);
  }, [openTickets, normalizedSearch]);

  const clientsWithTickets = useMemo(() => {
    const companyIds = new Set(openTickets.map((ticket) => ticket.company_id).filter(Boolean));
    return clients.filter((client) => client.company_id && companyIds.has(client.company_id)).slice(0, 6);
  }, [clients, openTickets]);

  const supportStateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    tickets.forEach((ticket) => {
      const state = normalizeStatus(ticket.estado) || "sin estado";
      counts.set(state, (counts.get(state) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [tickets]);

  const userName = useMemo(() => {
    const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    return String(metadata.nombre ?? metadata.name ?? user?.email?.split("@")[0] ?? "Equipo");
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] p-6">
        <div className="mx-auto flex min-h-[70vh] max-w-[1540px] items-center justify-center">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-[#102A66]" />
            <span className="text-sm font-medium text-slate-600">Cargando centro de soporte…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] text-slate-900">
      <div className="mx-auto max-w-[1540px] px-5 py-5 lg:px-8 lg:py-7">
        <header className="mb-7 flex flex-col gap-5 rounded-3xl border border-slate-200/80 bg-white px-5 py-5 shadow-[0_10px_35px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between lg:px-7">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#102A66] text-white shadow-sm">
              <Headphones className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#102A66]">Modira · Support</span>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Todo el soporte, en un solo lugar.</h1>
              <p className="mt-1 text-sm text-slate-500">Hola, {userName}. Aquí tienes la actividad operativa que necesita tu atención.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900" aria-label="Notificaciones" onClick={() => navigate("/employee/notifications")}>
              <Bell className="h-4.5 w-4.5" />
            </button>
            <button type="button" onClick={() => loadDashboard(true)} disabled={refreshing} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </button>
            <div className="ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{userName.slice(0, 2).toUpperCase()}</div>
          </div>
        </header>

        {error ? (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div><p className="font-semibold">Algunos datos no se han podido cargar</p><p className="mt-0.5 text-xs text-red-600">{error}</p></div>
          </div>
        ) : null}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Centro operativo</p>
            <p className="mt-1 text-sm text-slate-500">Incidencias, clientes y proyectos con acceso de consulta.</p>
          </div>
          <div className="relative">
            <button type="button" onClick={() => setPeriodOpen((value) => !value)} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm">
              {PERIODS.find((item) => item.value === period)?.label}
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            {periodOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                {PERIODS.map((item) => (
                  <button key={item.value} type="button" onClick={() => { setPeriod(item.value); setPeriodOpen(false); }} className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition ${period === item.value ? "bg-[#102A66]/[0.07] text-[#102A66]" : "text-slate-600 hover:bg-slate-50"}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Ticket} label="Tickets abiertos" value={openTickets.length} detail={`${urgentTickets.length} requieren atención prioritaria`} tone="amber" />
          <KpiCard icon={ShieldAlert} label="Prioridad alta" value={urgentTickets.length} detail="Incidencias abiertas de mayor prioridad" tone="red" />
          <KpiCard icon={MessageCircle} label="Tickets creados" value={periodCreatedTickets.length} detail="En el periodo seleccionado" tone="blue" />
          <KpiCard icon={CheckCircle2} label="Tickets cerrados" value={periodClosedTickets.length} detail="Resueltos en el periodo seleccionado" tone="green" />
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4"><p className="text-xs text-slate-400">Clientes con soporte</p><p className="mt-1 text-xl font-bold text-slate-900">{clientsWithTickets.length}</p></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4"><p className="text-xs text-slate-400">Clientes consultables</p><p className="mt-1 text-xl font-bold text-slate-900">{clients.length}</p></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4"><p className="text-xs text-slate-400">Proyectos consultables</p><p className="mt-1 text-xl font-bold text-slate-900">{projects.length}</p></div>
          <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-4"><p className="text-xs text-slate-400">Proyectos próximos</p><p className="mt-1 text-xl font-bold text-slate-900">{expiringProjects.length}</p></div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.75fr)]">
          <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] lg:p-6">
            <SectionTitle icon={LifeBuoy} title="Cola de soporte" description="Tickets abiertos ordenados por actividad reciente." action={<button type="button" onClick={() => navigate("/employee/support")} className="hidden items-center gap-1.5 text-xs font-semibold text-[#102A66] sm:flex">Ver soporte <ArrowRight className="h-3.5 w-3.5" /></button>} />
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar ticket, estado o prioridad…" className="w-full bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400" />
            </div>
            {filteredTickets.length ? (
              <div className="divide-y divide-slate-100">
                {filteredTickets.map((ticket) => (
                  <button key={ticket.id} type="button" onClick={() => navigate(`/employee/support/${ticket.id}`)} className="group flex w-full items-center gap-4 py-4 text-left transition hover:bg-slate-50/70 first:pt-2 last:pb-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 group-hover:bg-[#102A66]/[0.07] group-hover:text-[#102A66]"><Ticket className="h-4.5 w-4.5" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-slate-800">{ticket.titulo || "Ticket sin título"}</p><PriorityPill priority={ticket.prioridad} /></div>
                      <p className="mt-1 truncate text-xs text-slate-500">{ticket.descripcion || "Sin descripción disponible"}</p>
                      <p className="mt-1 text-[11px] text-slate-400">Actualizado {ticket.updated_at ? formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true, locale: es }) : "sin fecha"}</p>
                    </div>
                    <div className="hidden shrink-0 items-center gap-3 sm:flex"><StatusPill status={ticket.estado} /><ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-[#102A66]" /></div>
                  </button>
                ))}
              </div>
            ) : <EmptyState icon={CheckCircle2} title="No hay tickets pendientes" description="La cola de soporte está limpia con los filtros actuales." />}
          </section>

          <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] lg:p-6">
            <SectionTitle icon={Activity} title="Estado de soporte" description="Distribución actual de los tickets." />
            <div className="space-y-4">
              {supportStateCounts.length ? supportStateCounts.map(([state, count]) => {
                const total = Math.max(tickets.length, 1);
                const percentage = Math.round((count / total) * 100);
                return <div key={state}><div className="mb-1.5 flex items-center justify-between gap-3"><span className="text-xs font-semibold capitalize text-slate-700">{state.replaceAll("_", " ")}</span><span className="text-xs font-bold text-slate-900">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#102A66]" style={{ width: `${percentage}%` }} /></div><p className="mt-1 text-[10px] text-slate-400">{percentage}% del total</p></div>;
              }) : <EmptyState icon={Ticket} title="Sin actividad de soporte" description="Todavía no hay tickets disponibles para mostrar." />}
            </div>
            <button type="button" onClick={() => navigate("/employee/support")} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900">Abrir centro de soporte <ArrowRight className="h-3.5 w-3.5" /></button>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] lg:p-6">
            <SectionTitle icon={Users} title="Clientes con incidencias" description="Clientes vinculados a la cola de soporte actual." />
            {clientsWithTickets.length ? <div className="space-y-2">{clientsWithTickets.map((client) => { const count = openTickets.filter((ticket) => ticket.company_id === client.company_id).length; return <button key={client.id} type="button" onClick={() => navigate(`/employee/clients/${client.id}`)} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 px-3.5 py-3 text-left transition hover:border-slate-200 hover:bg-slate-50"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#102A66]/[0.07] text-xs font-bold text-[#102A66]">{String(client.nombre ?? client.empresa ?? "C").slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{client.nombre || client.empresa || "Cliente"}</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{client.email || "Sin email disponible"}</p></div><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">{count} {count === 1 ? "ticket" : "tickets"}</span><ArrowUpRight className="h-3.5 w-3.5 text-slate-300" /></button>; })}</div> : <EmptyState icon={Users} title="Sin clientes con incidencias" description="No hay clientes asociados a tickets abiertos en este momento." />}
          </section>

          <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] lg:p-6">
            <SectionTitle icon={FolderKanban} title="Proyectos próximos" description="Proyectos visibles para Support con una fecha de fin cercana." />
            {expiringProjects.length ? <div className="space-y-2">{expiringProjects.map((project) => <button key={project.id} type="button" onClick={() => navigate(`/employee/projects/${project.id}`)} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 px-3.5 py-3 text-left transition hover:border-slate-200 hover:bg-slate-50"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><FolderKanban className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{project.nombre || "Proyecto sin nombre"}</p><p className="mt-0.5 text-[11px] text-slate-400">Finaliza {project.fecha_fin ? format(new Date(project.fecha_fin), "d MMM yyyy", { locale: es }) : "—"}</p></div><StatusPill status={project.estado} /><ArrowUpRight className="h-3.5 w-3.5 text-slate-300" /></button>)}</div> : <EmptyState icon={FolderKanban} title="Sin próximos vencimientos" description="No hay proyectos visibles con fecha de fin dentro de los próximos 14 días." />}
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] lg:p-6">
            <SectionTitle icon={Clock3} title="Actividad reciente" description="Últimos eventos registrados en el sistema." />
            {activity.length ? <div className="divide-y divide-slate-100">{activity.map((item) => <div key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0"><div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Activity className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-700">{item.description || item.action || "Actividad registrada"}</p><p className="mt-1 text-[11px] text-slate-400">{item.resource_type ? `${item.resource_type} · ` : ""}{item.created_at ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: es }) : "sin fecha"}</p></div></div>)}</div> : <EmptyState icon={Activity} title="Sin actividad reciente" description="No hay eventos recientes disponibles para mostrar." />}
          </section>

          <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] lg:p-6">
            <SectionTitle icon={ExternalLink} title="Accesos de soporte" description="Módulos disponibles para tu rol." />
            <div className="grid gap-2 sm:grid-cols-2">
              <AccessCard icon={LifeBuoy} label="Soporte" description="Gestionar tickets" enabled={permissions["support.read"]} onClick={() => navigate("/employee/support")} />
              <AccessCard icon={Users} label="Clientes" description="Consulta de clientes" enabled={permissions["clients.read"]} onClick={() => navigate("/employee/clients")} />
              <AccessCard icon={FolderKanban} label="Proyectos" description="Consulta operativa" enabled={permissions["projects.read"]} onClick={() => navigate("/employee/projects")} />
              <AccessCard icon={Bell} label="Notificaciones" description="Avisos del sistema" enabled onClick={() => navigate("/employee/notifications")} />
            </div>
            <div className="mt-5 rounded-xl border border-[#102A66]/10 bg-[#102A66]/[0.035] px-4 py-3"><div className="flex gap-3"><Headphones className="mt-0.5 h-4 w-4 shrink-0 text-[#102A66]" /><div><p className="text-xs font-semibold text-slate-800">Enfoque Support</p><p className="mt-1 text-[11px] leading-5 text-slate-500">El dashboard prioriza incidencias y contexto operativo. Clientes y proyectos se mantienen como módulos de consulta, sin acciones de gestión fuera de los permisos del rol.</p></div></div></div>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] lg:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Resumen operativo</p><h2 className="mt-1 text-lg font-bold text-slate-950">La atención al cliente empieza aquí.</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Usa la cola de soporte como punto de entrada y consulta el contexto de clientes y proyectos cuando una incidencia lo requiera.</p></div>
            <button type="button" onClick={() => navigate("/employee/support")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#102A66] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0D2355]">Ir a soporte <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        </section>
      </div>
    </div>
  );
}

function AccessCard({ icon: Icon, label, description, enabled, onClick }: { icon: typeof Activity; label: string; description: string; enabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={!enabled} onClick={onClick} className={`group flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition ${enabled ? "border-slate-100 hover:border-slate-200 hover:bg-slate-50" : "cursor-not-allowed border-slate-100 bg-slate-50/60 opacity-50"}`}><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 group-hover:text-[#102A66]"><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-800">{label}</p><p className="mt-0.5 text-[10px] text-slate-400">{description}</p></div><ArrowUpRight className="h-3.5 w-3.5 text-slate-300" /></button>;
}
