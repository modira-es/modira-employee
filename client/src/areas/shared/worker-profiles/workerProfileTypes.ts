export type WorkerProfileRole = {
  code: string;
  name: string;
};

export type WorkerProfile = {
  worker_id: string;
  auth_user_id: string;
  name: string;
  email: string | null;
  status: string | null;
  is_active: boolean;
  roles: WorkerProfileRole[];
  assigned_tasks_count: number;
  completed_tasks_count: number;
};

export type WorkerTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type WorkerTaskFilter = "assigned" | "completed";

export const WORKER_PROFILE_PERMISSIONS = {
  read: "system.workers.read",
} as const;

export const ROLE_LABELS: Record<string, string> = {
  direction: "Dirección",
  commercial: "Comercial",
  accounting: "Administrativo",
  developer: "Developer",
  support: "Soporte",
};

export function roleLabel(code: string, fallback?: string) {
  return ROLE_LABELS[code] || fallback || code;
}
