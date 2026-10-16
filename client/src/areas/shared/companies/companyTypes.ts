export type Row = Record<string, any>;

export type Company = Row & {
  id: string;
  company_code: string;
  company_name: string;
  legal_name?: string | null;
  cif_vat?: string | null;
  billing_email?: string | null;
  phone?: string | null;
  website?: string | null;
  logo_url?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  industry?: string | null;
  employees?: number | null;
  timezone?: string | null;
  language?: string | null;
  currency?: string | null;
  stripe_customer_id?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  is_active?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  settings?: Row | null;
  created_at?: string | null;
  updated_at?: string | null;
  iva_recomendado_aplicado?: boolean;
  iva_recomendado_porcentaje?: number | null;
  iva_recomendado_por?: string | null;
  iva_recomendado_updated_at?: string | null;
};

export interface CompaniesProps {
  basePath?: string;
}
