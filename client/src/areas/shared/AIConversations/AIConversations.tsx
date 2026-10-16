import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Activity, ArrowLeft, Bot, Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign, Clock3, Loader2, MessageSquare, RefreshCw, Search, ShieldCheck, UserRound, Users, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { AIConversation, AIMessage, AIUsageReservation, AIUsagePeriod, AIAnonymousUsagePeriod, AIRateLimit, AIQuotaConfig, AIPanelData, AIConversationUsage, ConversationMeta, EmployeeAIConversationsProps, AIPermissions } from "./aiTypes";


/* ============================================================================
   TIPOS
   ========================================================================== */

function useWorkerPermissions() {
  const [permissions, setPermissions] = useState<AIPermissions>({
    canRead: false,
    canUse: false,
    canManage: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      const codes = ["ai.read", "ai.use", "ai.manage"];
      const results = await Promise.all(
        codes.map((code) =>
          supabase.rpc("current_worker_has_permission", {
            p_permission_code: code,
          })
        )
      );

      if (!alive) return;

      setPermissions({
        canRead: results[0].data === true,
        canUse: results[1].data === true,
        canManage: results[2].data === true,
      });
      setLoading(false);
    })().catch((error) => {
      console.error("[AIConversations] Permission load error:", error);
      if (alive) setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  return { permissions, loading };
}

/**
 * AI interna de trabajadores.
 *
 * Acceso de lectura/gestión:
 * - ai.read: consultar conversaciones y uso.
 * - ai.manage: también habilita el área de administración/operativa de IA.
 *
 * ai.use por sí solo no concede acceso al historial interno de conversaciones:
 * ese permiso corresponde al uso de Modira AI, no a su monitorización interna.
 */
export default function AIConversations({
  basePath = "/employee/ai",
  onNavigate,
}: EmployeeAIConversationsProps) {
  const [location] = useLocation();
  const { permissions, loading: permissionsLoading } = useWorkerPermissions();

  const base = basePath.replace(/\/+$/, "") || "/employee/ai";
  const detailId = getDetailId(location, base);

  if (permissionsLoading) {
    return (
      <PageShell
        title="Conversaciones IA"
        subtitle="Comprobando permisos de acceso..."
      >
        <PageLoading text="Comprobando permisos de IA..." />
      </PageShell>
    );
  }

  const canReadAI = permissions.canRead || permissions.canManage;

  if (!canReadAI) {
    return (
      <PageShell
        title="Conversaciones IA"
        subtitle="Acceso restringido"
      >
        <AccessDenied />
      </PageShell>
    );
  }

  if (detailId) {
    return (
      <AIConversationDetail
        conversationId={detailId}
        basePath={base}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <AIConversationList
      basePath={base}
      onNavigate={onNavigate}
      canManage={permissions.canManage}
    />
  );
}

function getDetailId(location: string, basePath: string) {
  const current = location.replace(/\/+$/, "");
  const base = basePath.replace(/\/+$/, "");

  if (!current.startsWith(`${base}/`)) return null;

  const rest = current.slice(`${base}/`.length);
  if (!rest) return null;

  return rest.split("/")[0] || null;
}

/* ============================================================================
   LISTADO
   ========================================================================== */

function AIConversationList({
  basePath,
  onNavigate,
  canManage,
}: {
  basePath: string;
  onNavigate?: (path: string) => void;
  canManage: boolean;
}) {
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [companies, setCompanies] = useState<{ id: string; company_name: string }[]>([]);
  const [messageMeta, setMessageMeta] = useState<Record<string, ConversationMeta>>({});
  const [panelData, setPanelData] = useState<AIPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [businessFilter, setBusinessFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();

  const loadData = async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError("");

      const [conversationResult, companyResult, messageResult, panelResult] =
        await Promise.all([
          supabase
            .from("ai_conversations")
            .select(
              "id, session_id, user_id, company_id, company_name, business_type, created_at, updated_at",
            )
            .order("updated_at", { ascending: false }),
          supabase
            .from("companies")
            .select("id, company_name")
            .order("company_name", { ascending: true }),
          supabase
            .from("ai_messages")
            .select("id, conversation_id, role, created_at")
            .order("created_at", { ascending: false }),
          supabase.rpc("get_ai_worker_panel_data"),
        ]);

      if (conversationResult.error) throw conversationResult.error;
      if (companyResult.error) throw companyResult.error;
      if (messageResult.error) throw messageResult.error;
      if (panelResult.error) throw panelResult.error;

      const meta: Record<string, ConversationMeta> = {};

      (messageResult.data || []).forEach((message: any) => {
        const current = meta[message.conversation_id];

        if (!current) {
          meta[message.conversation_id] = {
            count: 1,
            lastMessageAt: message.created_at || null,
          };
          return;
        }

        current.count += 1;

        if (
          message.created_at &&
          (!current.lastMessageAt ||
            new Date(message.created_at).getTime() >
              new Date(current.lastMessageAt).getTime())
        ) {
          current.lastMessageAt = message.created_at;
        }
      });

      setConversations((conversationResult.data || []) as AIConversation[]);
      setCompanies((companyResult.data || []) as { id: string; company_name: string }[]);
      setMessageMeta(meta);
      setPanelData(panelResult.data as AIPanelData);
    } catch (loadError: any) {
      console.error("[EmployeeAIConversations] Error loading AI panel:", loadError);
      setError(
        loadError?.message ||
          "No se pudieron cargar las conversaciones y métricas de IA.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const businessTypes = useMemo(
    () =>
      Array.from(
        new Set(
          conversations
            .map((conversation) => conversation.business_type?.trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => String(a).localeCompare(String(b), "es")) as string[],
    [conversations],
  );

  const usageByConversation = useMemo(() => {
    const map: Record<
      string,
      {
        requests: number;
        input: number;
        output: number;
        total: number;
        costCents: number;
        estimatedTotal: number;
        reservedTotal: number;
      }
    > = {};

    (panelData?.reservations || []).forEach((reservation) => {
      if (!reservation.conversation_id) return;

      const current =
        map[reservation.conversation_id] || {
          requests: 0,
          input: 0,
          output: 0,
          total: 0,
          costCents: 0,
          estimatedTotal: 0,
          reservedTotal: 0,
        };

      current.estimatedTotal += Number(reservation.estimated_total_tokens || 0);

      if (reservation.status === "reserved") {
        current.reservedTotal += Number(reservation.estimated_total_tokens || 0);
      }

      if (reservation.status === "consumed") {
        current.requests += 1;
        current.input += Number(reservation.actual_input_tokens || 0);
        current.output += Number(reservation.actual_output_tokens || 0);
        current.total += Number(reservation.actual_total_tokens || 0);
        current.costCents += Number(reservation.actual_cost_cents || 0);
      }

      map[reservation.conversation_id] = current;
    });

    return map;
  }, [panelData]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const now = Date.now();

    return conversations.filter((conversation) => {
      const companyMatch =
        companyFilter === "all" ||
        String(conversation.company_id || "") === String(companyFilter);

      const businessMatch =
        businessFilter === "all" ||
        String(conversation.business_type || "").trim() === businessFilter;

      let dateMatch = true;
      const createdAt = new Date(conversation.created_at).getTime();

      if (dateFilter !== "all") {
        if (!Number.isFinite(createdAt)) {
          dateMatch = false;
        } else if (dateFilter === "7d") {
          dateMatch = now - createdAt <= 7 * 24 * 60 * 60 * 1000;
        } else if (dateFilter === "30d") {
          dateMatch = now - createdAt <= 30 * 24 * 60 * 60 * 1000;
        } else if (dateFilter === "90d") {
          dateMatch = now - createdAt <= 90 * 24 * 60 * 60 * 1000;
        }
      }

      if (!companyMatch || !businessMatch || !dateMatch) return false;
      if (!query) return true;

      return [
        conversation.company_name,
        conversation.business_type,
        conversation.session_id,
        conversation.user_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [conversations, search, companyFilter, businessFilter, dateFilter]);

  const metrics = useMemo(() => {
    const totalMessages = Object.values(messageMeta).reduce(
      (sum, item) => sum + item.count,
      0,
    );

    const activeLast7Days = conversations.filter((conversation) => {
      const timestamp = new Date(conversation.updated_at).getTime();
      return Number.isFinite(timestamp) && nowDiff(timestamp) <= 7 * 24 * 60 * 60 * 1000;
    }).length;

    const companiesUsed = new Set(
      conversations.map((conversation) => conversation.company_id).filter(Boolean),
    ).size;

    const inputTokens = Number(panelData?.summary?.total_actual_input_tokens || 0);
    const outputTokens = Number(panelData?.summary?.total_actual_output_tokens || 0);
    const totalTokens = inputTokens + outputTokens;
    const costCents = Number(panelData?.summary?.total_actual_cost_cents || 0);

    return {
      total: conversations.length,
      totalMessages,
      activeLast7Days,
      companiesUsed,
      inputTokens,
      outputTokens,
      totalTokens,
      costCents,
    };
  }, [conversations, messageMeta, panelData]);

  if (loading) {
    return (
      <PageShell
        title="Conversaciones IA"
        subtitle="Cargando conversaciones y métricas de IA..."
      >
        <PageLoading text="Cargando conversaciones IA..." />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Conversaciones IA"
      subtitle="Consulta interna de conversaciones, consumo y controles de Modira AI"
    >
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-[#64748B]">
            <Bot className="h-4 w-4 text-[#1E3A8A]" />
            <span>Comunicación</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span>Conversaciones IA</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#172033]">
            Conversaciones IA
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Historial de Modira AI y visión operativa del consumo de tokens,
            costes, cuotas, reservas y rate limits registrados por el backend.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData(true)}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </section>

      {error && <ErrorBox message={error} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <MetricCard icon={<MessageSquare className="h-4 w-4" />} label="Conversaciones" value={metrics.total} />
        <MetricCard icon={<Bot className="h-4 w-4" />} label="Mensajes" value={metrics.totalMessages} />
        <MetricCard icon={<Activity className="h-4 w-4" />} label="Últimos 7 días" value={metrics.activeLast7Days} />
        <MetricCard icon={<Building2 className="h-4 w-4" />} label="Empresas" value={metrics.companiesUsed} />
        <MetricCard icon={<Zap className="h-4 w-4" />} label="Input tokens" value={formatInteger(metrics.inputTokens)} />
        <MetricCard icon={<Zap className="h-4 w-4" />} label="Output tokens" value={formatInteger(metrics.outputTokens)} />
        <MetricCard icon={<CircleDollarSign className="h-4 w-4" />} label="Coste real" value={formatEuroFromCents(metrics.costCents)} />
      </div>

      <Card className="border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 p-4 xl:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por empresa, sector, usuario o sesión..."
              className="h-10 border-gray-200 pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterSelect
              value={companyFilter}
              onChange={setCompanyFilter}
              options={[
                { value: "all", label: "Todas las empresas" },
                ...companies.map((company) => ({
                  value: company.id,
                  label: company.company_name,
                })),
              ]}
            />
            <FilterSelect
              value={businessFilter}
              onChange={setBusinessFilter}
              options={[
                { value: "all", label: "Todos los sectores" },
                ...businessTypes.map((businessType) => ({
                  value: businessType,
                  label: businessType,
                })),
              ]}
            />
            <FilterSelect
              value={dateFilter}
              onChange={setDateFilter}
              options={[
                { value: "all", label: "Cualquier fecha" },
                { value: "7d", label: "Últimos 7 días" },
                { value: "30d", label: "Últimos 30 días" },
                { value: "90d", label: "Últimos 90 días" },
              ]}
            />
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          hasFilters={Boolean(
            search ||
              companyFilter !== "all" ||
              businessFilter !== "all" ||
              dateFilter !== "all",
          )}
        />
      ) : (
        <>
          <Card className="hidden overflow-hidden border-gray-200 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3">Empresa / contexto</th>
                    <th className="px-5 py-3">Sector</th>
                    <th className="px-5 py-3">Mensajes</th>
                    <th className="px-5 py-3">Tokens</th>
                    <th className="px-5 py-3">Coste</th>
                    <th className="px-5 py-3">Creada</th>
                    <th className="px-5 py-3">Última actividad</th>
                    <th className="px-5 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((conversation) => {
                    const meta = messageMeta[conversation.id];
                    const usage = usageByConversation[conversation.id];

                    return (
                      <tr
                        key={conversation.id}
                        onClick={() => setLocation(`${basePath}/${conversation.id}`)}
                        className="cursor-pointer transition hover:bg-gray-50/80"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1E3A8A]">
                              <Bot className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900">
                                {conversationTitle(conversation)}
                              </p>
                              <p className="mt-0.5 max-w-[280px] truncate text-xs text-gray-500">
                                {conversation.user_id ? "Conversación autenticada" : "Conversación anónima"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {conversation.business_type ? (
                            <Badge variant="outline" className="border-gray-200 bg-white text-gray-600">
                              {conversation.business_type}
                            </Badge>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 font-semibold text-gray-800">
                          {meta?.count || 0}
                        </td>
                        <td className="px-5 py-4">
                          {usage?.total ? (
                            <div>
                              <p className="font-semibold text-gray-800">
                                {formatInteger(usage.total)}
                              </p>
                              <p className="mt-0.5 text-[11px] text-gray-400">
                                {formatInteger(usage.input)} in · {formatInteger(usage.output)} out
                              </p>
                            </div>
                          ) : (
                            <span className="text-gray-400">Sin datos</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {usage && usage.requests > 0 ? (
                            <span className="font-semibold text-gray-800">
                              {formatEuroFromCents(usage.costCents)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-gray-600">
                          {formatDate(conversation.created_at)}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-gray-700">
                            {formatRelative(conversation.updated_at)}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {formatDateTime(meta?.lastMessageAt || conversation.updated_at)}
                          </p>
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
          </Card>

          <div className="grid gap-3 md:hidden">
            {filtered.map((conversation) => {
              const meta = messageMeta[conversation.id];
              const usage = usageByConversation[conversation.id];

              return (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => setLocation(`${basePath}/${conversation.id}`)}
                  className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-gray-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1E3A8A]">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-gray-900">
                          {conversationTitle(conversation)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {conversation.business_type || "Sin sector definido"}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-400" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs">
                    <InfoMini label="Mensajes" value={meta?.count || 0} />
                    <InfoMini label="Tokens" value={usage?.total ? formatInteger(usage.total) : "Sin datos"} />
                    <InfoMini label="Coste" value={usage?.requests ? formatEuroFromCents(usage.costCents) : "—"} />
                    <InfoMini label="Última actividad" value={formatRelative(conversation.updated_at)} />
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Mostrando {filtered.length} de {conversations.length} conversaciones
        </span>
        <span className="hidden sm:inline">La información de infraestructura se entrega mediante RPC protegida para workers.</span>
      </div>

      {panelData && canManage && <AIOperationalPanel panelData={panelData} />}
    </PageShell>
  );
}

/* ============================================================================
   PANEL OPERATIVO — TODO EL ESTADO DE IA DE LA BD
   ========================================================================== */

function AIOperationalPanel({ panelData }: { panelData: AIPanelData }) {
  const config = panelData.config || {};
  const summary = panelData.summary || ({} as AIPanelData["summary"]);

  const currentAuthenticated = panelData.authenticated_usage || [];
  const currentAnonymous = panelData.anonymous_usage || [];

  return (
    <section className="space-y-6 pt-2">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm text-[#64748B]">
          <ShieldCheck className="h-4 w-4 text-[#1E3A8A]" />
          Infraestructura protegida
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-[#172033]">
          Control de Modira AI
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          Vista interna de las cuotas, reservas, consumo, configuración y rate limits.
          Estas tablas no tienen SELECT directo para el frontend.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <MetricCard icon={<Zap className="h-4 w-4" />} label="Tokens totales" value={formatInteger(Number(summary.total_actual_input_tokens || 0) + Number(summary.total_actual_output_tokens || 0))} />
        <MetricCard icon={<Zap className="h-4 w-4" />} label="Input total" value={formatInteger(Number(summary.total_actual_input_tokens || 0))} />
        <MetricCard icon={<Zap className="h-4 w-4" />} label="Output total" value={formatInteger(Number(summary.total_actual_output_tokens || 0))} />
        <MetricCard icon={<CircleDollarSign className="h-4 w-4" />} label="Coste total" value={formatEuroFromCents(Number(summary.total_actual_cost_cents || 0))} />
        <MetricCard icon={<CheckCircle2 className="h-4 w-4" />} label="Consumidas" value={summary.consumed_reservations || 0} />
        <MetricCard icon={<Clock3 className="h-4 w-4" />} label="Reservadas" value={summary.active_reservations || 0} />
        <MetricCard icon={<Activity className="h-4 w-4" />} label="Liberadas" value={summary.released_reservations || 0} />
        <MetricCard icon={<AlertCircle className="h-4 w-4" />} label="Expiradas" value={summary.expired_reservations || 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-900">Configuración de cuotas</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">Valores efectivos almacenados en <code>ai_quota_config</code>.</p>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <InfoBlock label="Servicio" value={config.config_key || "modira-ai"} icon={<Bot className="h-4 w-4" />} />
            <InfoBlock label="Estado" value={config.enabled ? "Activo" : "Desactivado"} icon={<ShieldCheck className="h-4 w-4" />} />
            <InfoBlock label="Límite requests / usuario" value={formatNullable(config.user_request_limit)} icon={<Users className="h-4 w-4" />} />
            <InfoBlock label="Límite requests / empresa" value={formatNullable(config.company_request_limit)} icon={<Building2 className="h-4 w-4" />} />
            <InfoBlock label="Límite requests anónimo" value={formatNullable(config.anonymous_request_limit)} icon={<UserRound className="h-4 w-4" />} />
            <InfoBlock label="Periodo autenticado" value={formatDuration(config.period_seconds)} icon={<Clock3 className="h-4 w-4" />} />
            <InfoBlock label="Periodo anónimo" value={formatDuration(config.anonymous_period_seconds)} icon={<Clock3 className="h-4 w-4" />} />
            <InfoBlock label="Máx. input tokens" value={formatNullable(config.max_input_tokens)} icon={<Zap className="h-4 w-4" />} />
            <InfoBlock label="Máx. output tokens" value={formatNullable(config.max_output_tokens)} icon={<Zap className="h-4 w-4" />} />
            <InfoBlock label="Presupuesto autenticado" value={formatEuroFromCents(config.budget_cents)} icon={<CircleDollarSign className="h-4 w-4" />} />
            <InfoBlock label="Presupuesto anónimo" value={formatEuroFromCents(config.anonymous_budget_cents)} icon={<CircleDollarSign className="h-4 w-4" />} />
            <InfoBlock label="Actualizado" value={formatDateTime(config.updated_at)} icon={<CalendarDays className="h-4 w-4" />} />
          </div>
        </Card>

        <Card className="border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-900">Estado de reservas</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">Cada petición puede reservar capacidad antes de llamar a OpenAI y después conciliar el uso real.</p>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <InfoBlock label="Total reservas" value={summary.reservation_count || 0} icon={<Activity className="h-4 w-4" />} />
            <InfoBlock label="Con conversación" value={summary.conversation_linked_reservations || 0} icon={<MessageSquare className="h-4 w-4" />} />
            <InfoBlock label="Sin conversación vinculada" value={summary.unlinked_reservations || 0} icon={<AlertCircle className="h-4 w-4" />} />
            <InfoBlock label="Coste real acumulado" value={formatEuroFromCents(summary.total_actual_cost_cents)} icon={<CircleDollarSign className="h-4 w-4" />} />
            <InfoBlock label="Input real acumulado" value={formatInteger(summary.total_actual_input_tokens)} icon={<Zap className="h-4 w-4" />} />
            <InfoBlock label="Output real acumulado" value={formatInteger(summary.total_actual_output_tokens)} icon={<Zap className="h-4 w-4" />} />
            <InfoBlock label="Tokens reales acumulados" value={formatInteger(Number(summary.total_actual_input_tokens || 0) + Number(summary.total_actual_output_tokens || 0))} icon={<Zap className="h-4 w-4" />} />
            <InfoBlock label="Registros rate limit" value={panelData.rate_limits?.length || 0} icon={<Activity className="h-4 w-4" />} />
          </div>
        </Card>
      </div>

      <details open className="group rounded-xl border border-gray-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-sm font-semibold text-gray-900">Cuotas autenticadas</p>
            <p className="mt-1 text-xs text-gray-500">Todos los registros de <code>ai_usage_periods</code>, incluidos scopes de usuario y empresa.</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-gray-100 p-5">
          {currentAuthenticated.length === 0 ? (
            <EmptyTable text="No hay periodos de cuota autenticados activos." />
          ) : (
            <UsagePeriodsTable rows={currentAuthenticated} />
          )}
        </div>
      </details>

      <details className="group rounded-xl border border-gray-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-sm font-semibold text-gray-900">Cuotas anónimas</p>
            <p className="mt-1 text-xs text-gray-500">Estado de <code>ai_anonymous_quota_periods</code>. La identidad se muestra enmascarada.</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-gray-100 p-5">
          {currentAnonymous.length === 0 ? (
            <EmptyTable text="No hay periodos de cuota anónimos activos." />
          ) : (
            <AnonymousUsageTable rows={currentAnonymous} />
          )}
        </div>
      </details>

      <details className="group rounded-xl border border-gray-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-sm font-semibold text-gray-900">Reservas y consumo real</p>
            <p className="mt-1 text-xs text-gray-500">Todos los registros de <code>ai_usage_reservations</code>, con estimaciones, uso real, estado y trazabilidad.</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-gray-100 p-5">
          <ReservationsTable rows={panelData.reservations || []} />
        </div>
      </details>

      <details className="group rounded-xl border border-gray-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-sm font-semibold text-gray-900">Rate limits</p>
            <p className="mt-1 text-xs text-gray-500">Registros operativos de <code>ai_rate_limits</code>. Las claves se muestran enmascaradas.</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-gray-100 p-5">
          <RateLimitsTable rows={panelData.rate_limits || []} />
        </div>
      </details>
    </section>
  );
}

/* ============================================================================
   DETALLE DE CONVERSACIÓN
   ========================================================================== */

function AIConversationDetail({
  conversationId,
  basePath,
  onNavigate,
}: {
  conversationId: string;
  basePath: string;
  onNavigate?: (path: string) => void;
}) {
  const [conversation, setConversation] = useState<AIConversation | null>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [usage, setUsage] = useState<AIConversationUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setLoadingMessages(true);
      setLoadingUsage(true);
      setError("");

      const [conversationResult, messagesResult, usageResult] = await Promise.all([
        supabase
          .from("ai_conversations")
          .select("id, session_id, user_id, company_id, company_name, business_type, created_at, updated_at")
          .eq("id", conversationId)
          .single(),
        supabase
          .from("ai_messages")
          .select("id, conversation_id, role, content, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true }),
        supabase.rpc("get_ai_worker_conversation_usage", {
          p_conversation_id: conversationId,
        }),
      ]);

      if (conversationResult.error) throw conversationResult.error;
      if (messagesResult.error) throw messagesResult.error;
      if (usageResult.error) throw usageResult.error;

      setConversation(conversationResult.data as AIConversation);
      setMessages((messagesResult.data || []) as AIMessage[]);
      setUsage(usageResult.data as AIConversationUsage);
    } catch (loadError: any) {
      console.error("[EmployeeAIConversations] Detail load error:", loadError);
      setError(loadError?.message || "No se pudo cargar la conversación de IA.");
    } finally {
      setLoading(false);
      setLoadingMessages(false);
      setLoadingUsage(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <PageShell
        title="Conversaciones IA"
        subtitle="Cargando conversación..."
      >
        <PageLoading text="Cargando conversación IA..." />
      </PageShell>
    );
  }

  if (!conversation) {
    return (
      <PageShell
        title="Conversaciones IA"
        subtitle="Ficha de conversación"
      >
        <ErrorState
          message={error || "Conversación no encontrada."}
          onBack={() => setLocation(basePath)}
        />
      </PageShell>
    );
  }

  const userMessages = messages.filter((message) => message.role?.toLowerCase() === "user").length;
  const assistantMessages = messages.filter((message) => message.role?.toLowerCase() === "assistant").length;
  const usageSummary = usage?.summary;

  return (
    <PageShell
      title="Conversaciones IA"
      subtitle="Ficha de conversación y consumo de IA"
    >
      <button
        type="button"
        onClick={() => setLocation(basePath)}
        className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a conversaciones IA
      </button>

      {error && <ErrorBox message={error} />}

      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge className="border-none bg-blue-100 text-blue-700 hover:bg-blue-100">
              <Bot className="mr-1 h-3.5 w-3.5" />
              Modira AI
            </Badge>
            <Badge variant="outline" className="border-gray-200 bg-white text-gray-600">
              {conversation.user_id ? "Autenticada" : "Anónima"}
            </Badge>
            {conversation.business_type && (
              <Badge variant="outline" className="border-gray-200 bg-white text-gray-600">
                {conversation.business_type}
              </Badge>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#172033]">
            {conversationTitle(conversation)}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Historial completo, contexto y consumo registrado por el backend para esta conversación.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Actualizar
        </button>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <MetricCard icon={<MessageSquare className="h-4 w-4" />} label="Mensajes" value={messages.length} />
        <MetricCard icon={<UserRound className="h-4 w-4" />} label="Usuario" value={userMessages} />
        <MetricCard icon={<Bot className="h-4 w-4" />} label="IA" value={assistantMessages} />
        <MetricCard icon={<Zap className="h-4 w-4" />} label="Input tokens" value={formatInteger(usageSummary?.input_tokens)} />
        <MetricCard icon={<Zap className="h-4 w-4" />} label="Output tokens" value={formatInteger(usageSummary?.output_tokens)} />
        <MetricCard icon={<Zap className="h-4 w-4" />} label="Tokens totales" value={formatInteger(usageSummary?.total_tokens)} />
        <MetricCard icon={<CircleDollarSign className="h-4 w-4" />} label="Coste real" value={formatEuroFromCents(usageSummary?.actual_cost_cents)} />
        <MetricCard icon={<Activity className="h-4 w-4" />} label="Requests" value={usageSummary?.request_count || 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="overflow-hidden border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Historial de mensajes</h2>
                <p className="mt-1 text-xs text-gray-500">Ordenado cronológicamente.</p>
              </div>
              <MessageSquare className="h-4 w-4 text-[#1E3A8A]" />
            </div>
            <div className="max-h-[680px] overflow-y-auto p-5">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-16 text-sm text-gray-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#1E3A8A]" />
                  Cargando mensajes...
                </div>
              ) : messages.length === 0 ? (
                <div className="py-16 text-center">
                  <MessageSquare className="mx-auto h-8 w-8 text-gray-300" />
                  <p className="mt-3 text-sm font-semibold text-gray-700">No hay mensajes</p>
                  <p className="mt-1 text-xs text-gray-500">La conversación no contiene mensajes visibles.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => {
                    const isUser = message.role?.toLowerCase() === "user";
                    const isAssistant = message.role?.toLowerCase() === "assistant";

                    return (
                      <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[90%] rounded-2xl border p-4 ${roleClass(message.role)} ${
                            isUser ? "rounded-br-md" : "rounded-bl-md"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <span
                                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                                  isUser
                                    ? "bg-blue-100 text-blue-700"
                                    : isAssistant
                                      ? "bg-gray-100 text-gray-700"
                                      : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {isUser ? <UserRound className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                              </span>
                              <span className="text-xs font-bold">{roleLabel(message.role)}</span>
                            </div>
                            <span className="text-[11px] text-gray-400">{formatDateTime(message.created_at)}</span>
                          </div>
                          <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card className="border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-4">
              <p className="text-sm font-semibold text-gray-900">Uso de IA de esta conversación</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                El consumo real procede de las reservas conciliadas por <code>finalize_ai_quota()</code>.
              </p>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <InfoBlock label="Input real" value={formatInteger(usageSummary?.input_tokens)} icon={<Zap className="h-4 w-4" />} />
              <InfoBlock label="Output real" value={formatInteger(usageSummary?.output_tokens)} icon={<Zap className="h-4 w-4" />} />
              <InfoBlock label="Total real" value={formatInteger(usageSummary?.total_tokens)} icon={<Zap className="h-4 w-4" />} />
              <InfoBlock label="Coste real" value={formatEuroFromCents(usageSummary?.actual_cost_cents)} icon={<CircleDollarSign className="h-4 w-4" />} />
              <InfoBlock label="Input estimado" value={formatInteger(usageSummary?.estimated_input_tokens)} icon={<Clock3 className="h-4 w-4" />} />
              <InfoBlock label="Output estimado" value={formatInteger(usageSummary?.estimated_output_tokens)} icon={<Clock3 className="h-4 w-4" />} />
              <InfoBlock label="Total estimado" value={formatInteger(usageSummary?.estimated_total_tokens)} icon={<Clock3 className="h-4 w-4" />} />
              <InfoBlock label="Coste estimado" value={formatEuroFromCents(usageSummary?.estimated_cost_cents)} icon={<Clock3 className="h-4 w-4" />} />
              <InfoBlock label="Input reservado" value={formatInteger(usageSummary?.reserved_input_tokens)} icon={<ShieldCheck className="h-4 w-4" />} />
              <InfoBlock label="Output reservado" value={formatInteger(usageSummary?.reserved_output_tokens)} icon={<ShieldCheck className="h-4 w-4" />} />
              <InfoBlock label="Total reservado" value={formatInteger(usageSummary?.reserved_total_tokens)} icon={<ShieldCheck className="h-4 w-4" />} />
              <InfoBlock label="Coste reservado" value={formatEuroFromCents(usageSummary?.reserved_cost_cents)} icon={<ShieldCheck className="h-4 w-4" />} />
            </div>

            {loadingUsage ? (
              <div className="border-t border-gray-100 p-6 text-center text-sm text-gray-500">
                <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-[#1E3A8A]" />
                Cargando reservas de esta conversación...
              </div>
            ) : (
              <div className="border-t border-gray-100 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#9AA2AE]">
                  Peticiones registradas
                </p>
                <ReservationsTable rows={usage?.events || []} compact />
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card className="border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-4">
              <p className="text-sm font-semibold text-gray-900">Contexto de la conversación</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">Datos almacenados junto a la sesión.</p>
            </div>
            <div className="space-y-4 p-4">
              <InfoBlock icon={<Building2 className="h-4 w-4" />} label="Empresa" value={conversation.company_name || "No asociada"} />
              <InfoBlock icon={<Users className="h-4 w-4" />} label="Tipo de negocio" value={conversation.business_type || "No definido"} />
              <InfoBlock icon={<UserRound className="h-4 w-4" />} label="Usuario" value={conversation.user_id || "Anónimo"} />
              <InfoBlock icon={<CalendarDays className="h-4 w-4" />} label="Creación" value={formatDateTime(conversation.created_at)} />
              <InfoBlock icon={<Clock3 className="h-4 w-4" />} label="Última actualización" value={formatDateTime(conversation.updated_at)} />
              <InfoBlock icon={<MessageSquare className="h-4 w-4" />} label="Primer mensaje del usuario" value={firstUserMessage(messages)} />
            </div>
          </Card>

          <Card className="border-blue-100 bg-blue-50/60 shadow-none">
            <div className="flex gap-3 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1E3A8A]" />
              <div>
                <p className="text-sm font-semibold text-[#1E3A8A]">Acceso de trabajador</p>
                <p className="mt-1 text-xs leading-5 text-gray-600">
                  La conversación y el consumo se consultan con RLS/RPC protegidas. El worker no recibe acceso directo a las tablas internas de cuota.
                </p>
              </div>
            </div>
          </Card>

          <Card className="border-gray-200 bg-white shadow-sm">
            <div className="p-4">
              <p className="text-sm font-semibold text-gray-900">Identificador de sesión</p>
              <p className="mt-1 break-all rounded-lg bg-gray-50 p-3 font-mono text-[11px] leading-5 text-gray-500">
                {conversation.session_id}
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </PageShell>
  );
}

/* ============================================================================
   TABLAS DE INFRAESTRUCTURA
   ========================================================================== */

function UsagePeriodsTable({ rows }: { rows: AIUsagePeriod[] }) {
  return (
    <ResponsiveTable
      headers={["Scope", "Usuario", "Empresa", "Periodo", "Requests", "Tokens reales", "Reservado", "Coste", "Actualizado"]}
    >
      {rows.map((row) => {
        const realTotal = Number(row.input_tokens || 0) + Number(row.output_tokens || 0);
        const reservedTotal = Number(row.reserved_input_tokens || 0) + Number(row.reserved_output_tokens || 0);
        return (
          <tr key={row.scope_key} className="border-b border-gray-100 last:border-0">
            <td className="px-4 py-3 font-mono text-[11px] text-gray-600">{row.scope_key}</td>
            <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{row.user_id}</td>
            <td className="px-4 py-3 text-gray-700">{row.company_id || "—"}</td>
            <td className="px-4 py-3 text-gray-600">
              <p>{formatDate(row.period_started_at)}</p>
              <p className="text-[11px] text-gray-400">→ {formatDateTime(row.period_ends_at)}</p>
            </td>
            <td className="px-4 py-3 font-semibold text-gray-800">{row.request_count}</td>
            <td className="px-4 py-3">
              <p className="font-semibold text-gray-800">{formatInteger(realTotal)}</p>
              <p className="text-[11px] text-gray-400">{formatInteger(row.input_tokens)} in · {formatInteger(row.output_tokens)} out</p>
            </td>
            <td className="px-4 py-3">
              <p className="font-semibold text-gray-700">{formatInteger(reservedTotal)}</p>
              <p className="text-[11px] text-gray-400">{row.reserved_requests} requests · {formatEuroFromCents(row.reserved_cost_cents)}</p>
            </td>
            <td className="px-4 py-3 font-semibold text-gray-800">{formatEuroFromCents(row.cost_cents)}</td>
            <td className="px-4 py-3 text-gray-600">{formatDateTime(row.updated_at)}</td>
          </tr>
        );
      })}
    </ResponsiveTable>
  );
}

function AnonymousUsageTable({ rows }: { rows: AIAnonymousUsagePeriod[] }) {
  return (
    <ResponsiveTable
      headers={["Identidad", "Periodo", "Requests", "Tokens reales", "Reservado", "Coste", "Actualizado"]}
    >
      {rows.map((row) => {
        const realTotal = Number(row.input_tokens || 0) + Number(row.output_tokens || 0);
        const reservedTotal = Number(row.reserved_input_tokens || 0) + Number(row.reserved_output_tokens || 0);
        return (
          <tr key={row.identity_key} className="border-b border-gray-100 last:border-0">
            <td className="px-4 py-3 font-mono text-[11px] text-gray-600">{maskAnonymousIdentity(row.identity_key)}</td>
            <td className="px-4 py-3 text-gray-600">
              <p>{formatDate(row.period_started_at)}</p>
              <p className="text-[11px] text-gray-400">→ {formatDateTime(row.period_ends_at)}</p>
            </td>
            <td className="px-4 py-3 font-semibold text-gray-800">{row.request_count}</td>
            <td className="px-4 py-3">
              <p className="font-semibold text-gray-800">{formatInteger(realTotal)}</p>
              <p className="text-[11px] text-gray-400">{formatInteger(row.input_tokens)} in · {formatInteger(row.output_tokens)} out</p>
            </td>
            <td className="px-4 py-3">
              <p className="font-semibold text-gray-700">{formatInteger(reservedTotal)}</p>
              <p className="text-[11px] text-gray-400">{row.reserved_requests} requests · {formatEuroFromCents(row.reserved_cost_cents)}</p>
            </td>
            <td className="px-4 py-3 font-semibold text-gray-800">{formatEuroFromCents(row.cost_cents)}</td>
            <td className="px-4 py-3 text-gray-600">{formatDateTime(row.updated_at)}</td>
          </tr>
        );
      })}
    </ResponsiveTable>
  );
}

function ReservationsTable({ rows, compact = false }: { rows: AIUsageReservation[]; compact?: boolean }) {
  if (!rows.length) return <EmptyTable text="No hay reservas registradas." />;

  return (
    <ResponsiveTable
      headers={[
        "Fecha",
        "Estado",
        "Modelo",
        "Conversación",
        "Estimado",
        "Real",
        "Coste",
        "Expira / finaliza",
        ...(compact ? [] : ["Scope"]),
      ]}
    >
      {rows.map((row) => (
        <tr key={row.id} className="border-b border-gray-100 last:border-0">
          <td className="px-4 py-3 text-gray-600">
            <p>{formatDate(row.created_at)}</p>
            <p className="text-[11px] text-gray-400">{formatDateTime(row.created_at)}</p>
          </td>
          <td className="px-4 py-3"><ReservationStatus status={row.status} /></td>
          <td className="px-4 py-3 text-gray-700">{row.model || "No registrado"}</td>
          <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{row.conversation_id || "Sin vincular"}</td>
          <td className="px-4 py-3">
            <p className="font-semibold text-gray-700">{formatInteger(row.estimated_total_tokens)}</p>
            <p className="text-[11px] text-gray-400">{formatInteger(row.estimated_input_tokens)} in · {formatInteger(row.estimated_output_tokens)} out</p>
          </td>
          <td className="px-4 py-3">
            {row.actual_input_tokens == null && row.actual_output_tokens == null ? (
              <span className="text-gray-400">Pendiente</span>
            ) : (
              <>
                <p className="font-semibold text-gray-800">{formatInteger(row.actual_total_tokens)}</p>
                <p className="text-[11px] text-gray-400">{formatInteger(row.actual_input_tokens)} in · {formatInteger(row.actual_output_tokens)} out</p>
              </>
            )}
          </td>
          <td className="px-4 py-3">
            <p className="font-semibold text-gray-800">{formatEuroFromCents(row.actual_cost_cents)}</p>
            <p className="text-[11px] text-gray-400">est. {formatEuroFromCents(row.estimated_cost_cents)}</p>
          </td>
          <td className="px-4 py-3 text-gray-600">
            <p>{formatDateTime(row.expires_at)}</p>
            <p className="text-[11px] text-gray-400">finalizada: {formatDateTime(row.finalized_at)}</p>
          </td>
          {!compact && <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{row.scope_key}</td>}
        </tr>
      ))}
    </ResponsiveTable>
  );
}

function RateLimitsTable({ rows }: { rows: AIRateLimit[] }) {
  if (!rows.length) return <EmptyTable text="No hay registros de rate limit." />;

  return (
    <ResponsiveTable headers={["Clave", "Requests", "Ventana iniciada", "Actualizado"]}>
      {rows.map((row, index) => (
        <tr key={`${row.key_masked}-${row.updated_at}-${index}`} className="border-b border-gray-100 last:border-0">
          <td className="px-4 py-3 font-mono text-[11px] text-gray-600">{row.key_masked}</td>
          <td className="px-4 py-3 font-semibold text-gray-800">{row.request_count}</td>
          <td className="px-4 py-3 text-gray-600">{formatDateTime(row.window_started_at)}</td>
          <td className="px-4 py-3 text-gray-600">{formatDateTime(row.updated_at)}</td>
        </tr>
      ))}
    </ResponsiveTable>
  );
}

function ResponsiveTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b border-gray-100 bg-gray-50/80 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            {headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ============================================================================
   HELPERS UI / FORMATO
   ========================================================================== */

function PageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#172033]">
      <div className="mx-auto w-full max-w-[1500px] space-y-6 p-5 sm:p-6 lg:p-8">
        <TopPageHeader eyebrow={title} subtitle={subtitle} />
        {children}
      </div>
    </div>
  );
}

function TopPageHeader({
  eyebrow,
  subtitle,
}: {
  eyebrow: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <p className="text-sm font-semibold text-[#263044]">{eyebrow}</p>
        <p className="text-xs text-[#939CAA]">{subtitle}</p>
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <Card className="border-gray-200 bg-white shadow-sm">
      <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-gray-900">
          No tienes acceso a Conversaciones IA
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">
          Esta área requiere el permiso <code>ai.read</code> o
          <code>ai.manage</code>. El permiso <code>ai.use</code> por sí solo
          está destinado al uso de Modira AI, no a la consulta interna de
          conversaciones y métricas.
        </p>
      </div>
    </Card>
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
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function ErrorState({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
        <div>
          <p className="font-semibold text-red-800">No se pudo cargar</p>
          <p className="mt-1 text-sm text-red-700">{message}</p>
          <button
            type="button"
            onClick={onBack}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card className="border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A]">
          <Bot className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-gray-900">
          {hasFilters ? "No hay conversaciones que coincidan" : "Todavía no hay conversaciones IA"}
        </h3>
        <p className="mt-1 max-w-md text-sm text-gray-500">
          {hasFilters ? "Prueba a cambiar la búsqueda o los filtros." : "Cuando existan conversaciones visibles para el área interna aparecerán aquí."}
        </p>
      </div>
    </Card>
  );
}

function EmptyTable({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-gray-500">{text}</div>;
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <Card className="border-gray-200 bg-white shadow-sm">
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
          <span className="text-[#1E3A8A]">{icon}</span>
          {label}
        </div>
        <p className="mt-2 truncate text-lg font-bold text-gray-900">{value}</p>
      </div>
    </Card>
  );
}

function FilterSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 max-w-[220px] rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
    >
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function InfoBlock({ icon, label, value }: { icon?: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0 text-gray-400">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold leading-5 text-gray-800">{value}</p>
      </div>
    </div>
  );
}

function InfoMini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-gray-500">{label}</p>
      <p className="mt-0.5 truncate font-medium text-gray-700">{value}</p>
    </div>
  );
}

function ReservationStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    reserved: "border-amber-100 bg-amber-50 text-amber-700",
    consumed: "border-emerald-100 bg-emerald-50 text-emerald-700",
    released: "border-gray-200 bg-gray-50 text-gray-600",
    expired: "border-red-100 bg-red-50 text-red-700",
  };
  const labels: Record<string, string> = {
    reserved: "Reservada",
    consumed: "Consumida",
    released: "Liberada",
    expired: "Expirada",
  };
  return <Badge variant="outline" className={map[status] || "border-gray-200 bg-white text-gray-600"}>{labels[status] || status}</Badge>;
}

function roleLabel(role: string) {
  const normalized = role.toLowerCase();
  if (normalized === "user") return "Usuario";
  if (normalized === "assistant") return "Modira AI";
  if (normalized === "system") return "Sistema";
  return role || "Mensaje";
}

function roleClass(role: string) {
  const normalized = role.toLowerCase();
  if (normalized === "user") return "border-blue-100 bg-blue-50 text-blue-900";
  if (normalized === "assistant") return "border-gray-200 bg-white text-gray-800";
  return "border-amber-100 bg-amber-50 text-amber-900";
}

function conversationTitle(conversation: AIConversation) {
  if (conversation.company_name?.trim()) return conversation.company_name.trim();
  if (conversation.business_type?.trim()) return conversation.business_type.trim();
  return "Conversación sin empresa";
}

function firstUserMessage(messages: AIMessage[]) {
  const message = messages.find((item) => item.role?.toLowerCase() === "user");
  if (!message?.content) return "Sin mensaje inicial";
  return message.content.replace(/\s+/g, " ").trim();
}

function formatInteger(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(Number(value));
}

function formatEuroFromCents(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 4 }).format(Number(value) / 100);
}

function formatNullable(value?: number | null) {
  return value == null ? "Sin límite" : formatInteger(value);
}

function formatDuration(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(Number(seconds))) return "—";
  const total = Number(seconds);
  if (total < 3600) return `${Math.round(total / 60)} min`;
  if (total % 3600 === 0) return `${total / 3600} h`;
  return `${Math.floor(total / 3600)} h ${Math.round((total % 3600) / 60)} min`;
}

function maskAnonymousIdentity(value?: string | null) {
  if (!value) return "—";
  if (value.length <= 18) return "••••••••";
  return `${value.slice(0, 9)}••••${value.slice(-6)}`;
}

function nowDiff(timestamp: number) {
  return Math.max(0, Date.now() - timestamp);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function formatRelative(value?: string | null) {
  if (!value) return "—";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Hace ${days} d`;
  return formatDate(value);
}