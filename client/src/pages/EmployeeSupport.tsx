import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
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
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  ExternalLink,
  FileText,
  Filter,
  FolderKanban,
  Loader2,
  Menu,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  User,
  X,
  Activity,
  Zap,
} from "lucide-react";

import { toast } from "sonner";

/* ============================================================================
   TIPOS
   ========================================================================== */

type TicketStatus = "abierto" | "en_progreso" | "cerrado";
type TicketPriority = "baja" | "normal" | "alta" | "urgente";

interface SupportTicket {
  id: string;
  user_id: string;
  company_id: string | null;
  titulo: string;
  descripcion: string;
  estado: TicketStatus;
  prioridad: TicketPriority;
  fecha_creacion: string;
  fecha_cierre: string | null;
  created_at: string;
  updated_at: string;
}

interface Company {
  id: string;
  company_name: string;
}

interface Profile {
  id: string;
  nombre: string | null;
  email: string | null;
}

interface ActivityEntry {
  id: string;
  user_id: string | null;
  company_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface EmployeeSupportProps {
  basePath?: string;
  onMenuNavigate?: (id: string) => void;
}

/* ============================================================================
   CONSTANTES
   ========================================================================== */

const STATUS_OPTIONS: Array<{
  value: "all" | TicketStatus;
  label: string;
}> = [
  { value: "all", label: "Todos los estados" },
  { value: "abierto", label: "Abierto" },
  { value: "en_progreso", label: "En progreso" },
  { value: "cerrado", label: "Cerrado" },
];

const PRIORITY_OPTIONS: Array<{
  value: "all" | TicketPriority;
  label: string;
}> = [
  { value: "all", label: "Todas las prioridades" },
  { value: "urgente", label: "Urgente" },
  { value: "alta", label: "Alta" },
  { value: "normal", label: "Normal" },
  { value: "baja", label: "Baja" },
];

const EDITABLE_STATUS_OPTIONS: Array<{
  value: TicketStatus;
  label: string;
}> = [
  { value: "abierto", label: "Abierto" },
  { value: "en_progreso", label: "En progreso" },
];

const PRIORITY_EDIT_OPTIONS: Array<{
  value: TicketPriority;
  label: string;
}> = [
  { value: "urgente", label: "Urgente" },
  { value: "alta", label: "Alta" },
  { value: "normal", label: "Normal" },
  { value: "baja", label: "Baja" },
];

const statusLabel = (status: TicketStatus) =>
  ({
    abierto: "Abierto",
    en_progreso: "En progreso",
    cerrado: "Cerrado",
  })[status];

const priorityLabel = (priority: TicketPriority) =>
  ({
    baja: "Baja",
    normal: "Normal",
    alta: "Alta",
    urgente: "Urgente",
  })[priority];

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const formatShortDate = (value: string | null | undefined) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
  }).format(date);
};

async function assertActiveWorker() {
  const { data, error } = await supabase.rpc("current_user_is_worker");

  if (error) throw error;

  if (data !== true) {
    throw new Error(
      "La sesión actual no corresponde a un trabajador activo de Modira."
    );
  }
}

/* ============================================================================
   UI BASE
   ========================================================================== */

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
          onOpenMenu={onOpenMenu}
        />
        {children}
      </div>
    </div>
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

function PageLoading({ text }: { text: string }) {
  return (
    <Card className="border border-slate-200 bg-white shadow-none">
      <div className="flex min-h-[420px] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#1E3A8A]" />
        <p className="mt-4 text-sm font-medium text-slate-600">{text}</p>
      </div>
    </Card>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <Card className="border border-red-200 bg-red-50 shadow-none">
      <div className="flex items-start gap-3 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div>
          <p className="font-semibold text-red-800">
            Se ha producido un error
          </p>
          <p className="mt-1 text-sm text-red-700">{message}</p>
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
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: string;
}) {
  return (
    <Card className="border border-slate-200 bg-white p-4 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-800">
            {value}
          </p>
          <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">
          {icon}
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: TicketStatus }) {
  const styles: Record<TicketStatus, string> = {
    abierto: "border-blue-200 bg-blue-50 text-blue-700",
    en_progreso: "border-amber-200 bg-amber-50 text-amber-700",
    cerrado: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };

  const dots: Record<TicketStatus, string> = {
    abierto: "bg-blue-500",
    en_progreso: "bg-amber-500",
    cerrado: "bg-emerald-500",
  };

  return (
    <Badge
      variant="outline"
      className={`${styles[status]} whitespace-nowrap font-semibold`}
    >
      <span
        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${dots[status]}`}
      />
      {statusLabel(status)}
    </Badge>
  );
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const styles: Record<TicketPriority, string> = {
    baja: "border-slate-200 bg-slate-50 text-slate-600",
    normal: "border-blue-200 bg-blue-50 text-blue-700",
    alta: "border-orange-200 bg-orange-50 text-orange-700",
    urgente: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <Badge
      variant="outline"
      className={`${styles[priority]} whitespace-nowrap font-semibold`}
    >
      {priorityLabel(priority)}
    </Badge>
  );
}

function QuotationVisualSection({
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
    <section className="border-b border-gray-200 pb-6 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          {icon ? <span className="text-[#1E3A8A]">{icon}</span> : null}
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        </div>
        {action}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}

/* ============================================================================
   MENÚ LATERAL — MISMA ESTRUCTURA VISUAL QUE PRESUPUESTOS
   ========================================================================== */

function EmployeeSupportNavigation({
  open,
  location,
  employeeRoot,
  supportBase,
  onClose,
  onNavigate,
}: {
  open: boolean;
  location: string;
  employeeRoot: string;
  supportBase: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
}) {
  const groups: Array<{
    title: string;
    items: Array<{
      id: string;
      label: string;
      icon: ComponentType<{ className?: string; strokeWidth?: number }>;
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
    if (id === "support") return location === supportBase || location.startsWith(`${supportBase}/`);
    if (id === "dashboard") return location === employeeRoot || location === `${employeeRoot}/`;
    return location === `${employeeRoot}/${id}` || location.startsWith(`${employeeRoot}/${id}/`);
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

/* ============================================================================
   LISTADO
   ========================================================================== */

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 border-gray-200 bg-white">
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
  );
}

function SupportTicketIcon({ large = false }: { large?: boolean }) {
  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]",
        large ? "h-12 w-12 rounded-2xl" : "h-9 w-9",
      ].join(" ")}
    >
      <Ticket className={large ? "h-6 w-6" : "h-4 w-4"} />
    </div>
  );
}

function InfoMini({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-400">{label}</p>
      <p
        className={[
          "mt-1 truncate text-sm",
          strong ? "font-semibold text-gray-900" : "font-medium text-gray-700",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function SupportTicketList({
  tickets,
  companies,
  loading,
  refreshing,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  onRefresh,
  onOpen,
}: {
  tickets: SupportTicket[];
  companies: Company[];
  loading: boolean;
  refreshing: boolean;
  search: string;
  setSearch: (value: string) => void;
  statusFilter: "all" | TicketStatus;
  setStatusFilter: (value: "all" | TicketStatus) => void;
  priorityFilter: "all" | TicketPriority;
  setPriorityFilter: (value: "all" | TicketPriority) => void;
  onRefresh: () => void;
  onOpen: (ticket: SupportTicket) => void;
}) {
  const companyName = useCallback(
    (companyId: string | null) => {
      if (!companyId) return "Sin empresa";
      return (
        companies.find((company) => company.id === companyId)?.company_name ||
        "Empresa no disponible"
      );
    },
    [companies],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...tickets]
      .filter((ticket) => {
        const searchValues = [
          ticket.titulo,
          ticket.descripcion,
          ticket.id,
          companyName(ticket.company_id),
        ];

        const searchMatch =
          !query ||
          searchValues.some((value) =>
            String(value || "").toLowerCase().includes(query),
          );

        const statusMatch =
          statusFilter === "all" || ticket.estado === statusFilter;

        const priorityMatch =
          priorityFilter === "all" || ticket.prioridad === priorityFilter;

        return searchMatch && statusMatch && priorityMatch;
      })
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() -
          new Date(a.updated_at).getTime(),
      );
  }, [
    tickets,
    companies,
    search,
    statusFilter,
    priorityFilter,
    companyName,
  ]);

  const metrics = useMemo(() => {
    const total = filtered.length;
    const open = filtered.filter((t) => t.estado === "abierto").length;
    const progress = filtered.filter((t) => t.estado === "en_progreso").length;
    const urgent = filtered.filter((t) => t.prioridad === "urgente").length;

    return { total, open, progress, urgent };
  }, [filtered]);

  if (loading) {
    return <PageLoading text="Cargando tickets..." />;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-[#64748B]">
            <Ticket className="h-4 w-4 text-[#1E3A8A]" />
            Gestión de soporte
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1E3A8A]">Tickets</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Gestiona las solicitudes de soporte, su prioridad, estado y seguimiento desde un único espacio.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={onRefresh}
          disabled={refreshing}
          className="h-10 border-gray-200 bg-white shadow-none"
        >
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Actualizar
        </Button>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          icon={<Ticket className="h-4 w-4" />}
          label="Total"
          value={metrics.total}
          detail="Tickets según los filtros"
        />
        <SummaryCard
          icon={<Clock3 className="h-4 w-4" />}
          label="Abiertos"
          value={metrics.open}
          detail="Pendientes de gestión"
        />
        <SummaryCard
          icon={<Activity className="h-4 w-4" />}
          label="En progreso"
          value={metrics.progress}
          detail="Tickets en seguimiento"
        />
        <SummaryCard
          icon={<AlertCircle className="h-4 w-4" />}
          label="Urgentes"
          value={metrics.urgent}
          detail="Prioridad urgente"
        />
      </div>

      <div className="border-gray-200 bg-white shadow-none">
        <div className="flex flex-col gap-3 p-4 xl:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título, empresa, descripción o ID..."
              className="h-10 border-gray-200 pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterSelect
              value={statusFilter}
              onChange={(value) =>
                setStatusFilter(value as "all" | TicketStatus)
              }
              options={STATUS_OPTIONS}
            />

            <FilterSelect
              value={priorityFilter}
              onChange={(value) =>
                setPriorityFilter(value as "all" | TicketPriority)
              }
              options={PRIORITY_OPTIONS}
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-gray-200 bg-white shadow-none">
          <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
            <SupportTicketIcon large />
            <h2 className="mt-4 text-base font-semibold text-gray-900">
              No hay tickets que mostrar
            </h2>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              No hay tickets que coincidan con la búsqueda y los filtros
              seleccionados.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="hidden overflow-hidden border-gray-200 bg-white shadow-none md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3">Ticket</th>
                    <th className="px-5 py-3">Empresa / solicitante</th>
                    <th className="px-5 py-3">Creación</th>
                    <th className="px-5 py-3">Actualización</th>
                    <th className="px-5 py-3">Prioridad</th>
                    <th className="px-5 py-3">Estado</th>
                    <th className="px-5 py-3 text-right"></th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {filtered.map((ticket) => (
                    <tr
                      key={ticket.id}
                      onClick={() => onOpen(ticket)}
                      className="cursor-pointer transition hover:bg-gray-50/80"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <SupportTicketIcon />

                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900">
                              {ticket.titulo || "Sin título"}
                            </p>
                            <p className="mt-0.5 max-w-[300px] truncate text-xs text-gray-500">
                              #{ticket.id}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-800">
                          {companyName(ticket.company_id)}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {ticket.user_id}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {formatShortDate(ticket.fecha_creacion)}
                      </td>

                      <td className="px-5 py-4 text-gray-600">
                        {formatShortDate(ticket.updated_at)}
                      </td>

                      <td className="px-5 py-4">
                        <PriorityBadge priority={ticket.prioridad} />
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={ticket.estado} />
                      </td>

                      <td className="px-5 py-4 text-right">
                        <ChevronRight className="ml-auto h-4 w-4 text-gray-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((ticket) => (
              <button
                type="button"
                key={ticket.id}
                onClick={() => onOpen(ticket)}
                className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-none transition hover:border-gray-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <SupportTicketIcon />

                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">
                        {ticket.titulo || "Sin título"}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        #{ticket.id}
                      </p>
                    </div>
                  </div>

                  <StatusBadge status={ticket.estado} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
                  <InfoMini
                    label="Empresa"
                    value={companyName(ticket.company_id)}
                  />
                  <InfoMini
                    label="Prioridad"
                    value={<PriorityBadge priority={ticket.prioridad} />}
                  />
                  <InfoMini
                    label="Creado"
                    value={formatShortDate(ticket.fecha_creacion)}
                  />
                  <InfoMini
                    label="Actualizado"
                    value={formatShortDate(ticket.updated_at)}
                  />
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Mostrando {filtered.length} de {tickets.length} tickets
        </span>

        <span className="hidden sm:inline">
          El acceso y las operaciones se controlan mediante las políticas de
          acceso de la base de datos.
        </span>
      </div>
    </div>
  );
}

/* ============================================================================
   DETALLE
   ========================================================================== */

function SupportTicketDetail({
  ticketId,
  onBack,
  onOpenMenu,
}: {
  ticketId: string;
  onBack: () => void;
  onOpenMenu: () => void;
}) {
  const { user } = useAuth();

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [requester, setRequester] = useState<Profile | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    estado: "abierto" as TicketStatus,
    prioridad: "normal" as TicketPriority,
  });

  const load = useCallback(
    async (silent = false) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        if (silent) setRefreshing(true);
        else setLoading(true);

        setError(null);

        const ticketResult = await supabase
          .from("support_tickets")
          .select("*")
          .eq("id", ticketId)
          .maybeSingle();

        if (ticketResult.error) throw ticketResult.error;

        if (!ticketResult.data) {
          throw new Error("Ticket no encontrado o no disponible.");
        }

        const current = ticketResult.data as SupportTicket;

        setTicket(current);
        setForm({
          titulo: current.titulo || "",
          descripcion: current.descripcion || "",
          estado: current.estado,
          prioridad: current.prioridad,
        });

        const [companyResult, requesterResult, activityResult] =
          await Promise.all([
            current.company_id
              ? supabase
                  .from("companies")
                  .select("id, company_name")
                  .eq("id", current.company_id)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null }),

            supabase
              .from("profiles")
              .select("id, nombre, email")
              .eq("id", current.user_id)
              .maybeSingle(),

            supabase
              .from("activity_log")
              .select(
                "id, user_id, company_id, action, resource_type, resource_id, description, metadata, created_at",
              )
              .eq("resource_id", current.id)
              .order("created_at", { ascending: false }),
          ]);

        if (companyResult.error) throw companyResult.error;
        if (requesterResult.error) throw requesterResult.error;
        if (activityResult.error) throw activityResult.error;

        setCompany((companyResult.data || null) as Company | null);
        setRequester((requesterResult.data || null) as Profile | null);
        setActivity((activityResult.data || []) as ActivityEntry[]);
      } catch (err: any) {
        console.error("[EmployeeSupport] Detail load error:", err);
        setError(err?.message || "No se pudo cargar el ticket.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, ticketId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!ticket) return;

    setSaving(true);
    setError(null);

    try {
      await assertActiveWorker();

      const title = form.titulo.trim();
      const description = form.descripcion.trim();

      if (!title) throw new Error("El título del ticket es obligatorio.");
      if (!description) {
        throw new Error("La descripción del ticket es obligatoria.");
      }

      if (form.estado === "cerrado" && ticket.estado !== "cerrado") {
        throw new Error(
          "Para cerrar un ticket utiliza la acción «Cerrar ticket».",
        );
      }

      const { data, error: updateError } = await supabase
        .from("support_tickets")
        .update({
          titulo: title,
          descripcion: description,
          estado: form.estado,
          prioridad: form.prioridad,
        })
        .eq("id", ticket.id)
        .select("*")
        .single();

      if (updateError) throw updateError;

      setTicket(data as SupportTicket);
      setEditing(false);
      toast.success("Ticket actualizado correctamente.");
      await load(true);
    } catch (err: any) {
      console.error("[EmployeeSupport] Save error:", err);
      setError(err?.message || "No se pudo actualizar el ticket.");
    } finally {
      setSaving(false);
    }
  };

  const closeTicket = async () => {
    if (!ticket || ticket.estado === "cerrado") return;

    const confirmed = window.confirm(
      "¿Quieres cerrar este ticket? Se registrará la fecha de cierre y la actividad correspondiente.",
    );

    if (!confirmed) return;

    setClosing(true);
    setError(null);

    try {
      await assertActiveWorker();

      const { data, error: rpcError } = await supabase.rpc(
        "close_support_ticket",
        { p_ticket_id: ticket.id },
      );

      if (rpcError) throw rpcError;

      const closed = Array.isArray(data) ? data[0] : data;

      if (!closed?.id) {
        throw new Error(
          "La base de datos no confirmó el cierre del ticket.",
        );
      }

      toast.success("Ticket cerrado correctamente.");
      setEditing(false);
      await load(true);
    } catch (err: any) {
      console.error("[EmployeeSupport] Close error:", err);
      setError(err?.message || "No se pudo cerrar el ticket.");
    } finally {
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <PageShell
        title="Tickets"
        subtitle="Cargando ticket..."
        onOpenMenu={onOpenMenu}
      >
        <PageLoading text="Cargando ticket..." />
      </PageShell>
    );
  }

  if (!ticket || error) {
    return (
      <div className="min-h-screen bg-white text-[#172033]">
        <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
          <TopPageHeader
            eyebrow="Tickets"
            subtitle="Ficha del ticket"
            onOpenMenu={onOpenMenu}
          />

          <Button
            variant="ghost"
            onClick={onBack}
            className="-ml-2 text-slate-600"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a tickets
          </Button>

          <ErrorBox message={error || "Ticket no encontrado."} />
        </div>
      </div>
    );
  }

  const requesterName =
    requester?.nombre || requester?.email || "Usuario no disponible";

  return (
    <div className="min-h-screen bg-white text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <TopPageHeader
          eyebrow="Tickets"
          subtitle="Ficha del ticket"
          onOpenMenu={onOpenMenu}
        />

        <div className="space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <button
                type="button"
                onClick={onBack}
                className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Volver a tickets
              </button>

              <div className="mb-2 flex items-center gap-2 text-sm text-[#64748B]">
                <Ticket className="h-4 w-4 text-[#1E3A8A]" />
                <span>Gestión de soporte</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span>Tickets</span>
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-[#1E3A8A]">
                {ticket.titulo || "Ticket"}
              </h1>

              <p className="mt-1 text-sm text-gray-500">
                Ticket #{ticket.id}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void load(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Actualizar
              </button>

              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#162D6B]"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </button>
              )}
            </div>
          </div>

          {error ? <ErrorBox message={error} /> : null}

          {editing ? (
            <Card className="border-gray-200 bg-white shadow-none">
              <div className="space-y-6 p-5 sm:p-6">
                <QuotationVisualSection
                  title="Editar ticket"
                  icon={<Pencil className="h-4 w-4" />}
                >
                  <div className="space-y-5">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                        Título
                      </label>
                      <Input
                        value={form.titulo}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            titulo: event.target.value,
                          }))
                        }
                        maxLength={500}
                        className="border-gray-200"
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                        Descripción
                      </label>
                      <Textarea
                        value={form.descripcion}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            descripcion: event.target.value,
                          }))
                        }
                        rows={8}
                        className="resize-y border-gray-200"
                        disabled={saving}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                          Estado
                        </label>
                        <FilterSelect
                          value={form.estado}
                          onChange={(value) =>
                            setForm((current) => ({
                              ...current,
                              estado: value as TicketStatus,
                            }))
                          }
                          options={
                            ticket.estado === "cerrado"
                              ? [{ value: "cerrado", label: "Cerrado" }]
                              : EDITABLE_STATUS_OPTIONS
                          }
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-gray-600">
                          Prioridad
                        </label>
                        <FilterSelect
                          value={form.prioridad}
                          onChange={(value) =>
                            setForm((current) => ({
                              ...current,
                              prioridad: value as TicketPriority,
                            }))
                          }
                          options={PRIORITY_EDIT_OPTIONS}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditing(false);
                          setForm({
                            titulo: ticket.titulo || "",
                            descripcion: ticket.descripcion || "",
                            estado: ticket.estado,
                            prioridad: ticket.prioridad,
                          });
                        }}
                        disabled={saving}
                        className="border-gray-200 bg-white shadow-none"
                      >
                        Cancelar
                      </Button>

                      <Button
                        type="button"
                        onClick={() => void save()}
                        disabled={saving}
                        className="bg-[#1E3A8A] shadow-none hover:bg-[#162D6B]"
                      >
                        {saving ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Guardar cambios
                      </Button>
                    </div>
                  </div>
                </QuotationVisualSection>
              </div>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <SummaryCard
                  icon={<Ticket className="h-4 w-4" />}
                  label="Estado"
                  value={statusLabel(ticket.estado)}
                  detail="Estado actual"
                />
                <SummaryCard
                  icon={<AlertCircle className="h-4 w-4" />}
                  label="Prioridad"
                  value={priorityLabel(ticket.prioridad)}
                  detail="Nivel asignado"
                />
                <SummaryCard
                  icon={<CalendarDays className="h-4 w-4" />}
                  label="Creación"
                  value={formatShortDate(ticket.fecha_creacion)}
                  detail={formatDate(ticket.fecha_creacion)}
                />
                <SummaryCard
                  icon={<Activity className="h-4 w-4" />}
                  label="Actualización"
                  value={formatShortDate(ticket.updated_at)}
                  detail={formatDate(ticket.updated_at)}
                />
                <SummaryCard
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  label="Cierre"
                  value={
                    ticket.fecha_cierre
                      ? formatShortDate(ticket.fecha_cierre)
                      : "Pendiente"
                  }
                  detail={
                    ticket.fecha_cierre
                      ? formatDate(ticket.fecha_cierre)
                      : "Sin fecha de cierre"
                  }
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="border-gray-200 bg-white shadow-none">
                  <div className="space-y-6">
                    <QuotationVisualSection
                      title="Información del ticket"
                      icon={<Ticket className="h-4 w-4" />}
                      action={
                        ticket.estado !== "cerrado" ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void closeTicket()}
                            disabled={closing}
                            className="h-9 border-emerald-200 bg-white text-emerald-700 shadow-none hover:bg-emerald-50"
                          >
                            {closing ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Cerrar ticket
                          </Button>
                        ) : null
                      }
                    >
                      <div className="grid gap-5 sm:grid-cols-2">
                        <div className="flex gap-3">
                          <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-500">
                              Solicitante
                            </p>
                            <p className="mt-1 break-words text-sm font-semibold text-gray-800">
                              {requesterName}
                            </p>
                            {requester?.email ? (
                              <p className="mt-0.5 break-all text-xs text-gray-500">
                                {requester.email}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-500">
                              Empresa
                            </p>
                            <p className="mt-1 break-words text-sm font-semibold text-gray-800">
                              {company?.company_name || "Sin empresa"}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div>
                            <p className="text-xs font-medium text-gray-500">
                              Fecha de creación
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-800">
                              {formatDate(ticket.fecha_creacion)}
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div>
                            <p className="text-xs font-medium text-gray-500">
                              Última actualización
                            </p>
                            <p className="mt-1 text-sm font-semibold text-gray-800">
                              {formatDate(ticket.updated_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </QuotationVisualSection>

                    <QuotationVisualSection
                      title="Descripción"
                      icon={<FileText className="h-4 w-4" />}
                    >
                      <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
                        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">
                          {ticket.descripcion || "Sin descripción."}
                        </p>
                      </div>
                    </QuotationVisualSection>

                    <QuotationVisualSection
                      title="Actividad del ticket"
                      icon={<Activity className="h-4 w-4" />}
                    >
                      {activity.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-300 p-5 text-center">
                          <Activity className="mx-auto h-5 w-5 text-gray-400" />
                          <p className="mt-2 text-sm font-medium text-gray-700">
                            Sin actividad registrada
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            El cierre protegido registra la actividad del
                            ticket.
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {activity.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex gap-3 py-4 first:pt-0 last:pb-0"
                            >
                              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1E3A8A]">
                                <Activity className="h-4 w-4" />
                              </div>

                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800">
                                  {entry.description || entry.action}
                                </p>
                                <p className="mt-1 text-xs text-gray-400">
                                  {formatDate(entry.created_at)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </QuotationVisualSection>
                  </div>
                </div>

                <aside className="space-y-6">
                  <div className="border-gray-200 bg-white shadow-none">
                    <div className="border-b border-gray-100 p-4">
                      <p className="text-sm font-semibold text-gray-900">
                        Estado del ticket
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        El estado refleja la situación actual de la solicitud.
                      </p>
                    </div>

                    <div className="space-y-4 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-500">Estado</span>
                        <StatusBadge status={ticket.estado} />
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-500">
                          Prioridad
                        </span>
                        <PriorityBadge priority={ticket.prioridad} />
                      </div>

                      {ticket.estado !== "cerrado" ? (
                        <div className="pt-2">
                          <Button
                            type="button"
                            onClick={() => void closeTicket()}
                            disabled={closing}
                            className="w-full bg-emerald-600 hover:bg-emerald-700"
                          >
                            {closing ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Cerrar ticket
                          </Button>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                          <p className="text-sm font-semibold text-emerald-800">
                            Ticket cerrado
                          </p>
                          <p className="mt-1 text-xs leading-5 text-emerald-700">
                            {ticket.fecha_cierre
                              ? `Cerrado el ${formatDate(ticket.fecha_cierre)}.`
                              : "El ticket figura como cerrado."}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-gray-200 bg-white shadow-none">
                    <div className="border-b border-gray-100 p-4">
                      <p className="text-sm font-semibold text-gray-900">
                        Solicitante
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        Datos del usuario asociado al ticket.
                      </p>
                    </div>

                    <div className="space-y-4 p-4">
                      <div className="flex gap-3">
                        <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800">
                            {requesterName}
                          </p>
                          {requester?.email ? (
                            <p className="mt-0.5 break-all text-xs text-gray-500">
                              {requester.email}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div className="min-w-0">
                          <p className="text-xs text-gray-500">Empresa</p>
                          <p className="mt-1 text-sm font-semibold text-gray-800">
                            {company?.company_name || "Sin empresa"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-gray-200 bg-white shadow-none">
                    <div className="border-b border-gray-100 p-4">
                      <p className="text-sm font-semibold text-gray-900">
                        Acceso y operaciones
                      </p>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        Las operaciones disponibles dependen de las políticas
                        y funciones definidas en la base de datos.
                      </p>
                    </div>

                    <div className="space-y-3 p-4">
                      <div className="flex gap-3">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <p className="text-xs leading-5 text-gray-600">
                          El worker activo puede consultar y actualizar los
                          tickets permitidos por RLS.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <p className="text-xs leading-5 text-gray-600">
                          El propietario y la empresa del ticket permanecen
                          protegidos por la base de datos.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <p className="text-xs leading-5 text-gray-600">
                          El cierre utiliza la operación protegida de cierre.
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

/* ============================================================================
   COMPONENTE PRINCIPAL
   ========================================================================== */

export default function EmployeeSupport({
  basePath = "/employee/support",
  onMenuNavigate,
}: EmployeeSupportProps) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const base = basePath.replace(/\/+$/, "") || "/employee/support";
  const employeeRoot = base.replace(/\/support$/, "") || "/employee";

  const normalizedLocation = location.split("?")[0].replace(/\/+$/, "");

  const ticketId =
    normalizedLocation.startsWith(`${base}/`) &&
    normalizedLocation !== `${base}/`
      ? normalizedLocation.slice(`${base}/`.length)
      : null;

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | TicketStatus
  >("all");
  const [priorityFilter, setPriorityFilter] = useState<
    "all" | TicketPriority
  >("all");

  const loadTickets = useCallback(
    async (silent = false) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        if (silent) setRefreshing(true);
        else setLoading(true);

        setError(null);

        await assertActiveWorker();

        const [ticketResult, companyResult] = await Promise.all([
          supabase
            .from("support_tickets")
            .select("*")
            .order("updated_at", { ascending: false }),

          supabase
            .from("companies")
            .select("id, company_name")
            .order("company_name", { ascending: true }),
        ]);

        if (ticketResult.error) throw ticketResult.error;

        setTickets((ticketResult.data || []) as SupportTicket[]);

        if (!companyResult.error) {
          setCompanies((companyResult.data || []) as Company[]);
        } else {
          setCompanies([]);
        }
      } catch (err: any) {
        console.error("[EmployeeSupport] List load error:", err);
        setError(
          err?.message ||
            "No se pudieron cargar los tickets de soporte."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (!ticketId) {
      void loadTickets();
    }
  }, [ticketId, loadTickets]);

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
        support: base,
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
    [base, employeeRoot, onMenuNavigate, setLocation]
  );

  const navigation = (
    <EmployeeSupportNavigation
      open={menuOpen}
      location={location}
      employeeRoot={employeeRoot}
      supportBase={base}
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

  if (ticketId) {
    return (
      <>
        {navigation}
        {overlay}
        <SupportTicketDetail
          ticketId={ticketId}
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

      <div className="min-h-screen bg-white text-[#172033]">
        <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
          <TopPageHeader
            eyebrow="Tickets"
            subtitle="Soporte"
            onOpenMenu={() => setMenuOpen(true)}
          />

          {error ? <ErrorBox message={error} /> : null}

          <SupportTicketList
            tickets={tickets}
            companies={companies}
            loading={loading}
            refreshing={refreshing}
            search={search}
            setSearch={setSearch}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            onRefresh={() => void loadTickets(true)}
            onOpen={(ticket) => {
              const detailUrl = `${window.location.origin}${base}/${ticket.id}`;
              const opened = window.open(
                detailUrl,
                "_blank",
                "noopener,noreferrer"
              );

              if (!opened) {
                setLocation(`${base}/${ticket.id}`);
              }
            }}
          />
        </div>
      </div>
    </>
  );
}
