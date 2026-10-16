import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  Activity,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Ticket,
  User,
} from "lucide-react";
import { toast } from "sonner";
import {
  EDITABLE_STATUS_OPTIONS,
  PRIORITY_EDIT_OPTIONS,
  SUPPORT_PERMISSIONS,
  type ActivityEntry,
  type Company,
  type Profile,
  type SupportTicket,
  type TicketPriority,
  type TicketStatus,
  formatDate,
  formatShortDate,
  priorityLabel,
  statusLabel,
} from "./supportTypes";
import {
  ErrorBox,
  FilterSelect,
  PageLoading,
  PageShell,
  PriorityBadge,
  StatusBadge,
  SummaryCard,
  SupportSection,
  TopPageHeader,
} from "./SupportUI";

async function assertActiveWorker() {
  const { data, error } = await supabase.rpc("current_user_is_worker");
  if (error) throw error;
  if (data !== true) {
    throw new Error("La sesión actual no corresponde a un trabajador activo de Modira.");
  }
}

function SupportTicketDetail({
  ticketId,
  onBack,
 }: {
  ticketId: string;
  onBack: () => void;
}) {
  const { user, hasPermission } = useAuth();
  const canRead = hasPermission(SUPPORT_PERMISSIONS.read);
  const canUpdate = hasPermission(SUPPORT_PERMISSIONS.update);

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
    if (!canUpdate) {
      setError("No tienes permiso para modificar tickets de soporte.");
      return;
    }

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
    if (!canUpdate || !ticket || ticket.estado === "cerrado") return;

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

  if (!canRead) {
    return (
      <div className="min-h-screen bg-white text-[#172033]">
        <div className="mx-auto w-full max-w-[1500px] p-5 sm:p-6 lg:p-8">
          <ErrorBox message="No tienes permiso para consultar los tickets de soporte." />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <PageShell
        title="Tickets"
        subtitle="Cargando ticket..."
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

              {!editing && canUpdate && (
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
                <SupportSection
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
                </SupportSection>
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
                    <SupportSection
                      title="Información del ticket"
                      icon={<Ticket className="h-4 w-4" />}
                      action={
                        canUpdate && ticket.estado !== "cerrado" ? (
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
                    </SupportSection>

                    <SupportSection
                      title="Descripción"
                      icon={<FileText className="h-4 w-4" />}
                    >
                      <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
                        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">
                          {ticket.descripcion || "Sin descripción."}
                        </p>
                      </div>
                    </SupportSection>

                    <SupportSection
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
                    </SupportSection>
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

                      {canUpdate && ticket.estado !== "cerrado" ? (
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

export default SupportTicketDetail;
