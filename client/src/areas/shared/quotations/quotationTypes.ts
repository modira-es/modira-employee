
import type { ReactNode, Dispatch, SetStateAction } from "react";

export type QuotationStatus = "Pendiente" | "Aceptado" | "Rechazado";

export interface Company {
  id: string;
  company_name: string;
  iva_recomendado_aplicado?: boolean;
  iva_recomendado_porcentaje?: number | null;
  iva_aprobado_aplicado?: boolean;
  iva_aprobado_porcentaje?: number | null;
  iva_aprobado_at?: string | null;
}

export interface Project {
  id: string;
  nombre: string;
  company_id: string | null;
  client_id: string | null;
  user_id: string | null;
  estado?: string | null;
}

export interface Profile {
  id: string;
  nombre: string | null;
  email: string | null;
  company_id: string | null;
}

export interface QuotationService {
  descripcion: string;
  cantidad: number;
  precio: number;
}

export interface Quotation {
  id: string;
  company_id: string;
  user_id: string;
  project_id: string | null;
  client_id: string | null;
  numero_presupuesto: string;
  titulo: string;
  descripcion_detallada: string | null;
  servicios_incluidos: QuotationService[];
  precio_base: number;
  iva_porcentaje: number;
  precio_total: number;
  irpf_aplicado: boolean;
  irpf_porcentaje: number;
  irpf_importe: number;
  estado: QuotationStatus;
  fecha_emision: string;
  fecha_validez: string | null;
  notas: string | null;
  document_path: string | null;
  document_sha256?: string | null;
  quotation_version?: number | null;
  created_at: string;
  updated_at: string;
  workflow_status?: "presented" | "in_review" | "accepted" | "rejected" | null;
  current_version_id?: string | null;
  current_version_label?: string | null;
}

export interface QuotationForm {
  company_id: string;
  project_id: string;
  numero_presupuesto: string;
  titulo: string;
  descripcion_detallada: string;
  servicios_incluidos: QuotationService[];
  iva_porcentaje: string;
  irpf_aplicado: boolean;
  irpf_porcentaje: string;
  estado: QuotationStatus;
  fecha_emision: string;
  fecha_validez: string;
  notas: string;
}

export const EMPTY_SERVICE: QuotationService = {
  descripcion: "",
  cantidad: 1,
  precio: 0,
};

export function emptyQuotationForm(): QuotationForm {
  return {
    company_id: "",
    project_id: "",
    numero_presupuesto: "",
    titulo: "",
    descripcion_detallada: "",
    servicios_incluidos: [{ ...EMPTY_SERVICE }],
    iva_porcentaje: "21",
    irpf_aplicado: false,
    irpf_porcentaje: "0",
    estado: "Pendiente",
    fecha_emision: getTodayForInput(),
    fecha_validez: "",
    notas: "",
  };
}

export function toForm(q: Quotation): QuotationForm {
  return {
    company_id: q.company_id || "",
    project_id: q.project_id || "",
    numero_presupuesto: q.numero_presupuesto || "",
    titulo: q.titulo || "",
    descripcion_detallada: q.descripcion_detallada || "",
    servicios_incluidos: Array.isArray(q.servicios_incluidos)
      ? q.servicios_incluidos.map((s) => ({
          descripcion: String(s?.descripcion || ""),
          cantidad: Number(s?.cantidad ?? 1),
          precio: Number(s?.precio ?? 0),
        }))
      : [],
    iva_porcentaje: String(q.iva_porcentaje ?? 21),
    irpf_aplicado: Boolean(q.irpf_aplicado),
    irpf_porcentaje: String(q.irpf_porcentaje ?? 0),
    estado: q.estado,
    fecha_emision: toInputDate(q.fecha_emision),
    fecha_validez: q.fecha_validez ? toInputDate(q.fecha_validez) : "",
    notas: q.notas || "",
  };
}

export function cleanServices(services: QuotationService[] | null | undefined) {
  return (services || [])
    .map((s) => ({
      descripcion: String(s?.descripcion || "").trim(),
      cantidad: Math.max(0, Number(s?.cantidad ?? 0)),
      precio: Math.max(0, Number(s?.precio ?? 0)),
    }))
    .filter((s) => s.descripcion || s.cantidad > 0 || s.precio > 0);
}

export function calculateSubtotal(services: QuotationService[] | null | undefined) {
  return Number(cleanServices(services).reduce(
    (sum, s) => sum + Number(s.cantidad || 0) * Number(s.precio || 0), 0
  ).toFixed(2));
}

export function calculateQuotationFiscalAmounts(
  subtotalValue: number,
  ivaPercentage: number,
  irpfApplied: boolean,
  irpfPercentage: number,
) {
  const subtotal = roundCurrency(Math.max(Number(subtotalValue) || 0, 0));
  const ivaRate = roundCurrency(Math.max(Number(ivaPercentage) || 0, 0));
  const ivaImporte = roundCurrency((subtotal * ivaRate) / 100);
  const total = roundCurrency(subtotal + ivaImporte);
  const irpfRate = irpfApplied ? roundCurrency(Math.max(Number(irpfPercentage) || 0, 0)) : 0;
  const irpfImporte = irpfApplied ? roundCurrency((subtotal * irpfRate) / 100) : 0;
  const importeAPagar = roundCurrency(Math.max(total - irpfImporte, 0));
  return { subtotal, ivaRate, ivaImporte, total, irpfRate, irpfImporte, importeAPagar };
}

export function roundCurrency(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

export function money(value: unknown, currency = "EUR") {
  const n = Number(value || 0);
  return new Intl.NumberFormat("es-ES", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function formatDate(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function toInputDate(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function toIsoDate(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

export function getTodayForInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function isExpired(value?: string | null) {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}
