export type AIConversation = {
  id: string;
  session_id: string;
  user_id?: string | null;
  company_id?: string | null;
  company_name?: string | null;
  business_type?: string | null;
  created_at: string;
  updated_at: string;
};

export type AIMessage = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
};

export type AIUsageReservation = {
  id: string;
  user_id: string | null;
  company_id: string | null;
  scope_key: string;
  conversation_id: string | null;
  model: string | null;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_total_tokens: number;
  estimated_cost_cents: number;
  actual_input_tokens: number | null;
  actual_output_tokens: number | null;
  actual_total_tokens: number;
  actual_cost_cents: number | null;
  status: "reserved" | "consumed" | "released" | "expired" | string;
  expires_at: string;
  created_at: string;
  finalized_at: string | null;
};

export type AIUsagePeriod = {
  scope_key: string;
  user_id: string;
  company_id: string | null;
  period_started_at: string;
  period_ends_at: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  reserved_requests: number;
  reserved_input_tokens: number;
  reserved_output_tokens: number;
  reserved_cost_cents: number;
  updated_at: string;
};

export type AIAnonymousUsagePeriod = {
  identity_key: string;
  period_started_at: string;
  period_ends_at: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  reserved_requests: number;
  reserved_input_tokens: number;
  reserved_output_tokens: number;
  reserved_cost_cents: number;
  updated_at: string;
};

export type AIRateLimit = {
  key_masked: string;
  window_started_at: string;
  request_count: number;
  created_at: string;
  updated_at: string;
};

export type AIQuotaConfig = {
  config_key?: string;
  enabled?: boolean;
  user_request_limit?: number | null;
  company_request_limit?: number | null;
  anonymous_request_limit?: number | null;
  anonymous_period_seconds?: number | null;
  period_seconds?: number | null;
  budget_cents?: number | null;
  anonymous_budget_cents?: number | null;
  max_input_tokens?: number | null;
  max_output_tokens?: number | null;
  updated_at?: string | null;
};

export type AIPanelData = {
  config: AIQuotaConfig;
  authenticated_usage: AIUsagePeriod[];
  anonymous_usage: AIAnonymousUsagePeriod[];
  reservations: AIUsageReservation[];
  rate_limits: AIRateLimit[];
  summary: {
    conversation_linked_reservations: number;
    unlinked_reservations: number;
    reservation_count: number;
    active_reservations: number;
    consumed_reservations: number;
    released_reservations: number;
    expired_reservations: number;
    total_actual_input_tokens: number;
    total_actual_output_tokens: number;
    total_actual_cost_cents: number;
  };
};

export type AIConversationUsage = {
  summary: {
    request_count: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    actual_cost_cents: number;
    estimated_input_tokens: number;
    estimated_output_tokens: number;
    estimated_total_tokens: number;
    estimated_cost_cents: number;
    reserved_input_tokens: number;
    reserved_output_tokens: number;
    reserved_total_tokens: number;
    reserved_cost_cents: number;
    has_usage_data: boolean;
  };
  events: AIUsageReservation[];
};

export type ConversationMeta = {
  count: number;
  lastMessageAt: string | null;
};

export type EmployeeAIConversationsProps = {
  basePath?: string;
  onNavigate?: (path: string) => void;
};

export type AIPermissions = {
  canRead: boolean;
  canUse: boolean;
  canManage: boolean;
};
