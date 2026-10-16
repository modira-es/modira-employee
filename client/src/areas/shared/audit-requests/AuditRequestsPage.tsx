import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

import {
  Search,
  RefreshCw,
  Building2,
  Users,
  Clock3,
  CheckCircle2,
  CircleDashed,
  X,
  Mail,
  CalendarDays,
  FileText,
  Save,
  AlertCircle,
  ChevronRight,
} from "lucide-react";

import "./AuditRequestsPage.css";

type AuditStatus =
  | "nuevo"
  | "en_revision"
  | "en_seguimiento"
  | "completado"
  | "descartado";

type AuditRequest = {
  id: string;
  nombre: string;
  email: string;
  empresa: string;
  empleados: string;
  proceso: string;
  estado: AuditStatus;
  notas_internas: string | null;
  created_at: string;
  updated_at: string;
};

type PermissionState = {
  read: boolean;
  update: boolean;
};

const STATUS_LABELS: Record<AuditStatus, string> = {
  nuevo: "Nuevo",
  en_revision: "En revisión",
  en_seguimiento: "En seguimiento",
  completado: "Completado",
  descartado: "Descartado",
};

const STATUS_HELP: Record<AuditStatus, string> = {
  nuevo: "Pendiente de revisar",
  en_revision: "Analizando la solicitud",
  en_seguimiento: "Contacto o información pendiente",
  completado: "Revisión inicial finalizada",
  descartado: "La solicitud no continúa",
};

const STATUS_ORDER: AuditStatus[] = [
  "nuevo",
  "en_revision",
  "en_seguimiento",
  "completado",
  "descartado",
];

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

export default function AuditRequestsPage() {
  const { user } = useAuth();

  const [permissions, setPermissions] =
    useState<PermissionState>({
      read: false,
      update: false,
    });

  const [permissionsLoading, setPermissionsLoading] =
    useState(true);

  const [requests, setRequests] =
    useState<AuditRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [query, setQuery] = useState("");

  const [statusFilter, setStatusFilter] =
    useState<"todos" | AuditStatus>("todos");

  const [selected, setSelected] =
    useState<AuditRequest | null>(null);

  const [draftStatus, setDraftStatus] =
    useState<AuditStatus>("nuevo");

  const [draftNotes, setDraftNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  /**
   * ==========================================================
   * PERMISOS
   * ==========================================================
   *
   * Seguimos el patrón utilizado en Quotations.tsx.
   * Los permisos se verifican en Supabase.
   */

  const checkPermissions = useCallback(async () => {
    if (!user?.id) {
      setPermissions({
        read: false,
        update: false,
      });

      setPermissionsLoading(false);
      return;
    }

    setPermissionsLoading(true);

    try {
      const codes = [
        "system.audit.read",
        "system.audit.update",
      ] as const;

      const entries = await Promise.all(
        codes.map(async (code) => {
          const { data, error } = await supabase.rpc(
            "current_worker_has_permission",
            {
              p_permission_code: code,
            }
          );

          return [
            code,
            !error && data === true,
          ] as const;
        })
      );

      const result = Object.fromEntries(
        entries
      ) as Record<string, boolean>;

      setPermissions({
        read: !!result["system.audit.read"],
        update: !!result["system.audit.update"],
      });
    } catch (error) {
      console.error(
        "[AuditRequests] Permission error:",
        error
      );

      setPermissions({
        read: false,
        update: false,
      });
    } finally {
      setPermissionsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void checkPermissions();
  }, [checkPermissions]);

  /**
   * ==========================================================
   * CARGAR SOLICITUDES
   * ==========================================================
   */

  const loadRequests = useCallback(
    async (quiet = false) => {
      if (!permissions.read) {
        setRequests([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setLoadError("");

      try {
        const { data, error } = await supabase
          .from("audit_requests")
          .select(
            [
              "id",
              "nombre",
              "email",
              "empresa",
              "empleados",
              "proceso",
              "estado",
              "notas_internas",
              "created_at",
              "updated_at",
            ].join(",")
          )
          .order("created_at", {
            ascending: false,
          });

        if (error) {
          throw error;
        }

        const valid = (data ?? []).map(
          (row: any): AuditRequest => ({
            ...row,
            estado: STATUS_ORDER.includes(
              row.estado as AuditStatus
            )
              ? (row.estado as AuditStatus)
              : "nuevo",
          })
        );

        setRequests(valid);

        setSelected((current) =>
          current
            ? valid.find(
                (item) => item.id === current.id
              ) ?? current
            : null
        );
      } catch (error) {
        console.error(
          "[AuditRequests] Load error:",
          error
        );

        setLoadError(
          error instanceof Error
            ? error.message
            : "No se han podido cargar las solicitudes."
        );

        setRequests([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [permissions.read]
  );

  useEffect(() => {
    if (!permissionsLoading) {
      void loadRequests();
    }
  }, [permissionsLoading, loadRequests]);

  /**
   * ==========================================================
   * DETALLE SELECCIONADO
   * ==========================================================
   */

  useEffect(() => {
    if (!selected) {
      return;
    }

    setDraftStatus(selected.estado);
    setDraftNotes(selected.notas_internas ?? "");
    setSaveError("");
    setSaveSuccess(false);
  }, [selected?.id]);

  const openRequest = (request: AuditRequest) => {
    setSelected(request);
    setDraftStatus(request.estado);
    setDraftNotes(request.notas_internas ?? "");
    setSaveError("");
    setSaveSuccess(false);
  };

  /**
   * ==========================================================
   * MÉTRICAS
   * ==========================================================
   */

  const counts = useMemo(
    () => ({
      total: requests.length,

      nuevo: requests.filter(
        (request) => request.estado === "nuevo"
      ).length,

      seguimiento: requests.filter(
        (request) =>
          request.estado === "en_revision" ||
          request.estado === "en_seguimiento"
      ).length,

      completado: requests.filter(
        (request) =>
          request.estado === "completado"
      ).length,
    }),
    [requests]
  );

  /**
   * ==========================================================
   * FILTRADO Y BÚSQUEDA
   * ==========================================================
   */

  const filtered = useMemo(() => {
    const needle = query
      .trim()
      .toLocaleLowerCase("es");

    return requests.filter((request) => {
      const matchesStatus =
        statusFilter === "todos" ||
        request.estado === statusFilter;

      const searchable = [
        request.nombre,
        request.email,
        request.empresa,
        request.empleados,
        request.proceso,
      ]
        .join(" ")
        .toLocaleLowerCase("es");

      return (
        matchesStatus &&
        (!needle || searchable.includes(needle))
      );
    });
  }, [requests, query, statusFilter]);

  /**
   * ==========================================================
   * GUARDAR CAMBIOS
   * ==========================================================
   *
   * La escritura se realiza exclusivamente mediante la RPC.
   * No se habilita UPDATE directo sobre audit_requests.
   */

  const saveRequest = async () => {
    if (!selected || !permissions.update || saving) {
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      const { data, error } = await supabase.rpc(
        "update_audit_request",
        {
          p_request_id: selected.id,
          p_estado: draftStatus,
          p_notas_internas:
            draftNotes.trim() || null,
        }
      );

      if (error) {
        throw error;
      }

      // La RPC devuelve la fila actualizada como JSONB.
      const updated =
        data &&
        typeof data === "object" &&
        !Array.isArray(data)
          ? (data as AuditRequest)
          : null;

      if (updated?.id) {
        setRequests((current) =>
          current.map((item) =>
            item.id === updated.id
              ? {
                  ...item,
                  ...updated,
                }
              : item
          )
        );

        setSelected((current) =>
          current?.id === updated.id
            ? {
                ...current,
                ...updated,
              }
            : current
        );

        setDraftStatus(updated.estado);
        setDraftNotes(
          updated.notas_internas ?? ""
        );
      } else {
        // Si la RPC no devuelve una fila, recargamos los datos.
        await loadRequests(true);
      }

      setSaveSuccess(true);
    } catch (error) {
      console.error(
        "[AuditRequests] Save error:",
        error
      );

      setSaveError(
        error instanceof Error
          ? error.message
          : "No se han podido guardar los cambios."
      );
    } finally {
      setSaving(false);
    }
  };

  /**
   * ==========================================================
   * ESTADOS DE CARGA Y ACCESO
   * ==========================================================
   */

  if (permissionsLoading || loading) {
    return (
      <main className="audit-page">
        <div className="audit-empty">
          <div className="audit-loader" />
          <span>Cargando solicitudes…</span>
        </div>
      </main>
    );
  }

  if (!permissions.read) {
    return (
      <main className="audit-page">
        <section className="audit-no-access">
          <div className="audit-no-access-icon">
            <AlertCircle size={25} />
          </div>

          <h1>Acceso no disponible</h1>

          <p>
            Tu usuario no tiene permiso para consultar
            las solicitudes de auditoría.
          </p>
        </section>
      </main>
    );
  }

  /**
   * ==========================================================
   * INTERFAZ
   * ==========================================================
   */

  return (
    <main className="audit-page">
      <header className="audit-page-header">
        <div>
          <div className="audit-eyebrow">
            GESTIÓN COMERCIAL
          </div>

          <h1>Solicitudes de auditoría</h1>

          <p>
            Consulta las solicitudes recibidas y
            organiza su seguimiento.
          </p>
        </div>

        <button
          className="audit-button audit-button-secondary"
          onClick={() => void loadRequests(true)}
          disabled={refreshing || loading}
        >
          <RefreshCw
            size={16}
            className={
              refreshing ? "audit-spin" : ""
            }
          />
          Actualizar
        </button>
      </header>

      <section
        className="audit-stats"
        aria-label="Resumen de solicitudes"
      >
        <StatCard
          label="Solicitudes totales"
          value={counts.total}
          icon={<FileText size={19} />}
          tone="navy"
          caption="Todas las recibidas"
        />

        <StatCard
          label="Nuevas"
          value={counts.nuevo}
          icon={<CircleDashed size={19} />}
          tone="blue"
          caption="Pendientes de revisar"
        />

        <StatCard
          label="En curso"
          value={counts.seguimiento}
          icon={<Clock3 size={19} />}
          tone="amber"
          caption="Revisión y seguimiento"
        />

        <StatCard
          label="Completadas"
          value={counts.completado}
          icon={<CheckCircle2 size={19} />}
          tone="green"
          caption="Revisión finalizada"
        />
      </section>

      <section className="audit-list-card">
        <div className="audit-list-heading">
          <div>
            <h2>Bandeja de solicitudes</h2>

            <p>
              {filtered.length}{" "}
              {filtered.length === 1
                ? "solicitud"
                : "solicitudes"}
              {statusFilter !== "todos"
                ? ` · ${STATUS_LABELS[statusFilter]}`
                : ""}
            </p>
          </div>
        </div>

        <div className="audit-toolbar">
          <label className="audit-search">
            <Search size={18} />

            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Buscar por contacto, empresa o proceso…"
            />

            {query && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setQuery("")}
              >
                <X size={15} />
              </button>
            )}
          </label>

          <select
            aria-label="Filtrar por estado"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as
                  | "todos"
                  | AuditStatus
              )
            }
            className="audit-filter"
          >
            <option value="todos">
              Todos los estados
            </option>

            {STATUS_ORDER.map((status) => (
              <option
                key={status}
                value={status}
              >
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        {loadError && (
          <div className="audit-alert audit-alert-error">
            <AlertCircle size={17} />
            No se pudieron cargar las solicitudes.{" "}
            {loadError}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="audit-empty">
            <div className="audit-empty-icon">
              <Search size={22} />
            </div>

            <strong>
              {requests.length
                ? "No hay resultados"
                : "Todavía no hay solicitudes"}
            </strong>

            <span>
              {requests.length
                ? "Prueba con otro término o cambia el filtro."
                : "Las solicitudes enviadas desde la web aparecerán aquí."}
            </span>
          </div>
        ) : (
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Contacto</th>
                  <th>Empresa</th>
                  <th>Proceso / necesidad</th>
                  <th>Recibida</th>
                  <th>Estado</th>
                  <th aria-label="Abrir detalle" />
                </tr>
              </thead>

              <tbody>
                {filtered.map((request) => (
                  <tr
                    key={request.id}
                    className={
                      selected?.id === request.id
                        ? "is-selected"
                        : ""
                    }
                    onClick={() =>
                      openRequest(request)
                    }
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" ||
                        event.key === " "
                      ) {
                        event.preventDefault();
                        openRequest(request);
                      }
                    }}
                  >
                    <td>
                      <div className="audit-contact-cell">
                        <div className="audit-avatar">
                          {initials(request.nombre)}
                        </div>

                        <div className="audit-contact-copy">
                          <strong>
                            {request.nombre}
                          </strong>

                          <span>
                            {request.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div className="audit-company">
                        <Building2 size={15} />
                        <span>{request.empresa}</span>
                      </div>

                      <small className="audit-muted">
                        {request.empleados} empleados
                      </small>
                    </td>

                    <td>
                      <div className="audit-process-preview">
                        {request.proceso}
                      </div>
                    </td>

                    <td>
                      <span className="audit-date">
                        {formatDate(
                          request.created_at
                        )}
                      </span>
                    </td>

                    <td>
                      <StatusBadge
                        status={request.estado}
                      />
                    </td>

                    <td>
                      <ChevronRight
                        size={17}
                        className="audit-row-chevron"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="audit-list-footer">
          <span>
            Los datos se consultan respetando los
            permisos de la base de datos.
          </span>

          <span>
            {requests.length} registros
          </span>
        </footer>
      </section>

      {selected && (
        <div
          className="audit-drawer-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget
            ) {
              setSelected(null);
            }
          }}
        >
          <aside
            className="audit-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audit-detail-title"
          >
            <header className="audit-drawer-header">
              <div>
                <span className="audit-eyebrow">
                  DETALLE DE SOLICITUD
                </span>

                <h2 id="audit-detail-title">
                  {selected.empresa}
                </h2>

                <p>
                  Recibida el{" "}
                  {formatDate(selected.created_at)}
                </p>
              </div>

              <button
                className="audit-icon-button"
                aria-label="Cerrar detalle"
                onClick={() => setSelected(null)}
              >
                <X size={19} />
              </button>
            </header>

            <div className="audit-drawer-content">
              <div className="audit-detail-contact">
                <div className="audit-avatar audit-avatar-large">
                  {initials(selected.nombre)}
                </div>

                <div>
                  <strong>{selected.nombre}</strong>

                  <a href={`mailto:${selected.email}`}>
                    <Mail size={14} />
                    {selected.email}
                  </a>
                </div>
              </div>

              <div className="audit-detail-grid">
                <DetailItem
                  icon={<Building2 size={16} />}
                  label="Empresa"
                  value={selected.empresa}
                />

                <DetailItem
                  icon={<Users size={16} />}
                  label="Tamaño de empresa"
                  value={`${selected.empleados} empleados`}
                />

                <DetailItem
                  icon={<CalendarDays size={16} />}
                  label="Última actualización"
                  value={formatDate(
                    selected.updated_at
                  )}
                />
              </div>

              <section className="audit-detail-section">
                <h3>
                  Proceso o necesidad descrita
                </h3>

                <div className="audit-process-full">
                  {selected.proceso}
                </div>
              </section>

              <section className="audit-detail-section">
                <div className="audit-section-title">
                  <h3>Seguimiento interno</h3>

                  {!permissions.update && (
                    <span className="audit-readonly-label">
                      Solo lectura
                    </span>
                  )}
                </div>

                <label
                  className="audit-field-label"
                  htmlFor="audit-status"
                >
                  Estado de la solicitud
                </label>

                <select
                  id="audit-status"
                  className="audit-select"
                  value={draftStatus}
                  disabled={
                    !permissions.update || saving
                  }
                  onChange={(event) => {
                    setDraftStatus(
                      event.target.value as AuditStatus
                    );
                    setSaveSuccess(false);
                  }}
                >
                  {STATUS_ORDER.map((status) => (
                    <option
                      key={status}
                      value={status}
                    >
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>

                <p className="audit-field-help">
                  {STATUS_HELP[draftStatus]}
                </p>

                <label
                  className="audit-field-label"
                  htmlFor="audit-notes"
                >
                  Notas internas{" "}
                  <span>
                    · No visibles para el solicitante
                  </span>
                </label>

                <textarea
                  id="audit-notes"
                  className="audit-notes"
                  rows={6}
                  maxLength={5000}
                  value={draftNotes}
                  disabled={
                    !permissions.update || saving
                  }
                  onChange={(event) => {
                    setDraftNotes(
                      event.target.value
                    );
                    setSaveSuccess(false);
                  }}
                  placeholder="Añade contexto, acuerdos, próximos pasos o información para el equipo…"
                />

                <div className="audit-char-count">
                  {draftNotes.length}/5000 caracteres
                </div>

                {saveError && (
                  <div className="audit-alert audit-alert-error">
                    <AlertCircle size={16} />
                    {saveError}
                  </div>
                )}

                {saveSuccess && (
                  <div className="audit-alert audit-alert-success">
                    <CheckCircle2 size={16} />
                    Cambios guardados correctamente.
                  </div>
                )}
              </section>
            </div>

            <footer className="audit-drawer-footer">
              <button
                className="audit-button audit-button-secondary"
                onClick={() => setSelected(null)}
              >
                Cerrar
              </button>

              {permissions.update && (
                <button
                  className="audit-button audit-button-primary"
                  onClick={() => void saveRequest()}
                  disabled={
                    saving ||
                    (
                      draftStatus === selected.estado &&
                      draftNotes.trim() ===
                        (selected.notas_internas ?? "")
                    )
                  }
                >
                  <Save size={16} />

                  {saving
                    ? "Guardando…"
                    : "Guardar cambios"}
                </button>
              )}
            </footer>
          </aside>
        </div>
      )}
    </main>
  );
}

/**
 * ============================================================
 * COMPONENTES AUXILIARES
 * ============================================================
 */

function StatCard({
  label,
  value,
  icon,
  tone,
  caption,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
  caption: string;
}) {
  return (
    <article className="audit-stat-card">
      <div className={`audit-stat-icon ${tone}`}>
        {icon}
      </div>

      <div className="audit-stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{caption}</small>
      </div>
    </article>
  );
}

function StatusBadge({
  status,
}: {
  status: AuditStatus;
}) {
  return (
    <span
      className={`audit-status-badge status-${status}`}
    >
      <span />
      {STATUS_LABELS[status]}
    </span>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="audit-detail-item">
      <span className="audit-detail-item-icon">
        {icon}
      </span>

      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}