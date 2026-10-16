export interface WorkerRole {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  is_active: boolean;
  worker_count: number;
  permission_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface WorkerPermission {
  id: string;
  code: string;
  resource: string;
  action: string;
  description: string | null;
  active_role_count: number;
  role_codes: string[] | null;
  role_names: string[] | null;
}

export interface WorkerRoleAssignment {
  worker_id: string;
  auth_user_id: string;
  worker_name: string | null;
  is_active: boolean;
  role_codes: string[] | null;
  role_names: string[] | null;
}

export interface WorkerRoleInfo {
  role_id: string;
  role_code: string;
  role_name: string;
  role_description: string | null;
  is_system_role: boolean;
  is_active: boolean;
}
