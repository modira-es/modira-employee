import { useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  Activity,
  Clock3,
  Search,
  Ticket,
} from "lucide-react";
import {
  FilterSelect,
  InfoMini,
  PriorityBadge,
  StatusBadge,
  SummaryCard,
  SupportTicketIcon,
  PageLoading,
} from "./SupportUI";
import {
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  type Company,
  type SupportTicket,
  type TicketPriority,
  type TicketStatus,
  formatShortDate,
} from "./supportTypes";

export default function SupportTicketList({
  tickets,
  companies,
  loading,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  onOpen,
}: {
  tickets: SupportTicket[];
  companies: Company[];
  loading: boolean;
  search: string;
  setSearch: (value: string) => void;
  statusFilter: "all" | TicketStatus;
  setStatusFilter: (value: "all" | TicketStatus) => void;
  priorityFilter: "all" | TicketPriority;
  setPriorityFilter: (value: "all" | TicketPriority) => void;
  onOpen: (ticket: SupportTicket) => void;
}) {
  const companyName = useCallback(
    (companyId: string | null) => {
      if (!companyId) return "Sin empresa";
      return companies.find((company) => company.id === companyId)?.company_name || "Empresa no disponible";
    },
    [companies],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...tickets]
      .filter((ticket) => {
        const searchValues = [ticket.titulo, ticket.descripcion, ticket.id, companyName(ticket.company_id)];
        const searchMatch =
          !query || searchValues.some((value) => String(value || "").toLowerCase().includes(query));
        const statusMatch = statusFilter === "all" || ticket.estado === statusFilter;
        const priorityMatch = priorityFilter === "all" || ticket.prioridad === priorityFilter;
        return searchMatch && statusMatch && priorityMatch;
      })
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [tickets, companies, search, statusFilter, priorityFilter, companyName]);

  const metrics = useMemo(() => ({
    total: filtered.length,
    open: filtered.filter((t) => t.estado === "abierto").length,
    progress: filtered.filter((t) => t.estado === "en_progreso").length,
    urgent: filtered.filter((t) => t.prioridad === "urgente").length,
  }), [filtered]);

  if (loading) return <PageLoading text="Cargando tickets..." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={<Ticket className="h-4 w-4" />} label="Total" value={metrics.total} detail="Tickets según los filtros" />
        <SummaryCard icon={<Clock3 className="h-4 w-4" />} label="Abiertos" value={metrics.open} detail="Pendientes de gestión" />
        <SummaryCard icon={<Activity className="h-4 w-4" />} label="En progreso" value={metrics.progress} detail="Tickets en seguimiento" />
        <SummaryCard icon={<AlertCircle className="h-4 w-4" />} label="Urgentes" value={metrics.urgent} detail="Prioridad urgente" />
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
              onChange={(value) => setStatusFilter(value as "all" | TicketStatus)}
              options={STATUS_OPTIONS}
            />
            <FilterSelect
              value={priorityFilter}
              onChange={(value) => setPriorityFilter(value as "all" | TicketPriority)}
              options={PRIORITY_OPTIONS}
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-gray-200 bg-white shadow-none">
          <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
            <SupportTicketIcon large />
            <h2 className="mt-4 text-base font-semibold text-gray-900">No hay tickets que mostrar</h2>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              No hay tickets que coincidan con la búsqueda y los filtros seleccionados.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden border border-gray-200 bg-white shadow-none md:block">
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
                    <tr key={ticket.id} onClick={() => onOpen(ticket)} className="cursor-pointer transition hover:bg-gray-50/80">
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <SupportTicketIcon />
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900">{ticket.titulo || "Sin título"}</p>
                            <p className="mt-0.5 max-w-[300px] truncate text-xs text-gray-500">#{ticket.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-800">{companyName(ticket.company_id)}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{ticket.user_id}</p>
                      </td>
                      <td className="px-5 py-4 text-gray-600">{formatShortDate(ticket.fecha_creacion)}</td>
                      <td className="px-5 py-4 text-gray-600">{formatShortDate(ticket.updated_at)}</td>
                      <td className="px-5 py-4"><PriorityBadge priority={ticket.prioridad} /></td>
                      <td className="px-5 py-4"><StatusBadge status={ticket.estado} /></td>
                      <td className="px-5 py-4 text-right">→</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((ticket) => (
              <button type="button" key={ticket.id} onClick={() => onOpen(ticket)}
                className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-none transition hover:border-gray-300">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <SupportTicketIcon />
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{ticket.titulo || "Sin título"}</p>
                      <p className="truncate text-xs text-gray-500">#{ticket.id}</p>
                    </div>
                  </div>
                  <StatusBadge status={ticket.estado} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
                  <InfoMini label="Empresa" value={companyName(ticket.company_id)} />
                  <InfoMini label="Prioridad" value={<PriorityBadge priority={ticket.prioridad} />} />
                  <InfoMini label="Creado" value={formatShortDate(ticket.fecha_creacion)} />
                  <InfoMini label="Actualizado" value={formatShortDate(ticket.updated_at)} />
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Mostrando {filtered.length} de {tickets.length} tickets</span>
        <span className="hidden sm:inline">El acceso y las operaciones se controlan mediante las políticas de acceso de la base de datos.</span>
      </div>
    </div>
  );
}
