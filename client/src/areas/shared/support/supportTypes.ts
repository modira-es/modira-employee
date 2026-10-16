export type TicketStatus = "abierto" | "en_progreso" | "cerrado";
export type TicketPriority = "baja" | "normal" | "alta" | "urgente";

export interface SupportTicket {
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

export interface Company {
  id: string;
  company_name: string;
}

export interface Profile {
  id: string;
  nombre: string | null;
  email: string | null;
}

export interface ActivityEntry {
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

export const STATUS_OPTIONS: Array<{
  value: "all" | TicketStatus;
  label: string;
}> = [
  { value: "all", label: "Todos los estados" },
  { value: "abierto", label: "Abierto" },
  { value: "en_progreso", label: "En progreso" },
  { value: "cerrado", label: "Cerrado" },
];

export const PRIORITY_OPTIONS: Array<{
  value: "all" | TicketPriority;
  label: string;
}> = [
  { value: "all", label: "Todas las prioridades" },
  { value: "urgente", label: "Urgente" },
  { value: "alta", label: "Alta" },
  { value: "normal", label: "Normal" },
  { value: "baja", label: "Baja" },
];

export const EDITABLE_STATUS_OPTIONS: Array<{
  value: TicketStatus;
  label: string;
}> = [
  { value: "abierto", label: "Abierto" },
  { value: "en_progreso", label: "En progreso" },
];

export const PRIORITY_EDIT_OPTIONS: Array<{
  value: TicketPriority;
  label: string;
}> = [
  { value: "urgente", label: "Urgente" },
  { value: "alta", label: "Alta" },
  { value: "normal", label: "Normal" },
  { value: "baja", label: "Baja" },
];

export const statusLabel = (status: TicketStatus) =>
  ({
    abierto: "Abierto",
    en_progreso: "En progreso",
    cerrado: "Cerrado",
  })[status];

export const priorityLabel = (priority: TicketPriority) =>
  ({
    baja: "Baja",
    normal: "Normal",
    alta: "Alta",
    urgente: "Urgente",
  })[priority];

export const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const formatShortDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
  }).format(date);
};

export const SUPPORT_PERMISSIONS = {
  read: "support.read",
  create: "support.create",
  update: "support.update",
  delete: "support.delete",
} as const;
