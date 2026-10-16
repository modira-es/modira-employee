export type InvoiceStatus =  "borrador" | "pendiente" | "pagada" | "vencida" | "cancelada";

export type ServiceLine = {
  descripcion: string;
  cantidad: number;
  precio: number;
};

export type InvoiceForm = {
  company_id: string;
  project_id: string;
  user_id: string;
  numero_factura: string;
  titulo: string;
  descripcion_detallada: string;
  servicios_incluidos: ServiceLine[];
  precio_base: string;
  iva_aplicado: boolean;
  iva_porcentaje: string;
  irpf_aplicado: boolean;
  irpf_porcentaje: string;
  estado: InvoiceStatus;
  fecha_emision: string;
  fecha_vencimiento: string;
  notas: string;
  rectifies_invoice_id: string;
  rectification_reason: string;
  rectification_customer_data_source: "original_invoice" | "current_company";
};

export type Invoice = Record<string, any>;
export type Company = Record<string, any>;
export type Project = Record<string, any>;
export type Profile = Record<string, any>;

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  borrador: "Borrador",
  pendiente: "Pendiente",
  pagada: "Pagada",
  vencida: "Vencida",
  cancelada: "Cancelada",
};

export const WORKER_EDITABLE_STATUSES: InvoiceStatus[] = [
  "borrador",
  "pendiente",
  "vencida",
  "cancelada",
];

export function roundCurrency(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

export function calculateFiscalAmounts(
  subtotalValue: number,
  ivaApplied: boolean,
  ivaPercentage: number,
  irpfApplied: boolean,
  irpfPercentage: number,
) {
  const subtotal = roundCurrency(Math.max(Number(subtotalValue) || 0, 0));
  const ivaRate = ivaApplied ? roundCurrency(Math.max(Number(ivaPercentage) || 0, 0)) : 0;
  const ivaImporte = ivaApplied ? roundCurrency((subtotal * ivaRate) / 100) : 0;
  const monto = roundCurrency(subtotal + ivaImporte);
  const irpfRate = irpfApplied ? roundCurrency(Math.max(Number(irpfPercentage) || 0, 0)) : 0;
  const irpfImporte = irpfApplied ? roundCurrency((subtotal * irpfRate) / 100) : 0;
  const importeAPagar = roundCurrency(Math.max(monto - irpfImporte, 0));
  return { subtotal, ivaRate, ivaImporte, monto, irpfRate, irpfImporte, importeAPagar };
}

export const emptyForm = (): InvoiceForm => ({
  company_id: "",
  project_id: "",
  user_id: "",
  numero_factura: "",
  titulo: "",
  descripcion_detallada: "",
  servicios_incluidos: [{ descripcion: "", cantidad: 1, precio: 0 }],
  precio_base: "",
  iva_aplicado: true,
  iva_porcentaje: "21",
  irpf_aplicado: false,
  irpf_porcentaje: "0",
  estado: "pendiente",
  fecha_emision: getTodayForInput(),
  fecha_vencimiento: "",
  notas: "",
   rectifies_invoice_id: "",
  rectification_reason: "",
  rectification_customer_data_source: "original_invoice",
});

export function getTodayForInput() {
  return new Date().toISOString().slice(0, 10);
}

export function money(value: unknown, currency = "EUR") {
  const number = Number(value || 0);
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
}

export function dateLabel(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function normalizedStatus(value: unknown): InvoiceStatus {
  const status = String(value || "").toLowerCase() as InvoiceStatus;
  return ["borrador", "pendiente", "pagada", "vencida", "cancelada"].includes(status) ? status : "pendiente";
}

export function calculateSubtotal(lines: ServiceLine[]) {
  return lines.reduce((total, line) => total + Number(line.cantidad || 0) * Number(line.precio || 0), 0);
}

export function parseInvoiceDescription(description: string | null | undefined) {
  const text = String(description || "").trim();
  if (!text) return { title: "", descriptionDetail: "", notes: "", services: [{ descripcion: "", cantidad: 1, precio: 0 }] as ServiceLine[] };
  const lines = text.split("\n");
  const titleLine = lines.find((line) => line.toLowerCase().startsWith("título:"));
  const descriptionLine = lines.find((line) => line.toLowerCase().startsWith("descripción detallada:"));
  const notesLine = lines.find((line) => line.toLowerCase().startsWith("notas:"));
  const toNumber = (value: string) => {
    const raw = String(value || "").trim().replace(/\s/g, "");
    if (!raw) return 0;
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    let normalized = raw;
    if (lastComma !== -1 && lastDot !== -1) normalized = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
    else if (lastComma !== -1) normalized = raw.replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const services = lines.flatMap((line) => {
    const match = line.match(/^\-\s*(.*?)\s*\|\s*Cantidad:\s*([0-9.,]+)\s*\|\s*Precio:\s*([0-9.,]+)\s*€/i);
    return match ? [{ descripcion: match[1].trim(), cantidad: toNumber(match[2]) || 0, precio: toNumber(match[3]) || 0 }] : [];
  });
  return {
    title: titleLine ? titleLine.slice("Título:".length).trim() : lines[0] || "",
    descriptionDetail: descriptionLine ? descriptionLine.slice("Descripción detallada:".length).trim() : "",
    notes: notesLine ? notesLine.slice("Notas:".length).trim() : "",
    services: services.length ? services : [{ descripcion: "", cantidad: 1, precio: 0 } as ServiceLine],
  };
}

export function buildInvoiceDescription(form: InvoiceForm) {
  const servicesText = form.servicios_incluidos
    .filter((service) => String(service.descripcion || "").trim() || Number(service.cantidad || 0) !== 0 || Number(service.precio || 0) !== 0)
    .map((service) => `- ${String(service.descripcion || "Servicio").trim() || "Servicio"} | Cantidad: ${Number(service.cantidad || 0)} | Precio: ${Number(service.precio || 0).toFixed(2)} €`)
    .join("\n");
  return [
    form.titulo.trim() ? `Título: ${form.titulo.trim()}` : null,
    form.descripcion_detallada.trim() ? `Descripción detallada: ${form.descripcion_detallada.trim()}` : null,
    servicesText ? `Servicios incluidos:\n${servicesText}` : null,
    form.notas.trim() ? `Notas: ${form.notas.trim()}` : null,
  ].filter(Boolean).join("\n\n");
}

export function toForm(invoice: any): InvoiceForm {
  const parsed = parseInvoiceDescription(invoice?.descripcion);
  return {
    company_id: invoice?.company_id || "",
    project_id: invoice?.project_id || "",
    user_id: invoice?.user_id || "",
    numero_factura: invoice?.numero_factura || "",
    titulo: parsed.title,
    descripcion_detallada: parsed.descriptionDetail,
    servicios_incluidos: parsed.services,
    precio_base: String(invoice?.subtotal ?? Math.max(Number(invoice?.monto || 0) - Number(invoice?.iva_importe || 0), 0)),
    iva_aplicado: invoice?.iva_aplicado !== false,
    iva_porcentaje: String(invoice?.iva_porcentaje ?? 0),
    irpf_aplicado: Boolean(invoice?.irpf_aplicado),
    irpf_porcentaje: String(invoice?.irpf_porcentaje ?? 0),
    estado: normalizedStatus(invoice?.estado),
    fecha_emision: invoice?.fecha_emision ? new Date(invoice.fecha_emision).toISOString().slice(0, 10) : getTodayForInput(),
    fecha_vencimiento: invoice?.fecha_vencimiento ? new Date(invoice.fecha_vencimiento).toISOString().slice(0, 10) : "",
    notas: parsed.notes,
       rectifies_invoice_id: invoice?.rectifies_invoice_id || "",
    rectification_reason: invoice?.rectification_reason || "",
    rectification_customer_data_source:
      invoice?.rectification_customer_data_source === "current_company"
        ? "current_company"
        : "original_invoice",
  };
}

export function validateForm(form: InvoiceForm) {
  if (!form.company_id) return "Selecciona una empresa.";
  if (!form.project_id) return "Selecciona un proyecto.";
  if (!form.titulo.trim()) return "Introduce un título para la factura.";
  const subtotal = Number(form.precio_base || 0);
  const iva = Number(form.iva_porcentaje || 0);
  const irpf = Number(form.irpf_porcentaje || 0);
  if (!Number.isFinite(subtotal) || subtotal < 0) return "La base imponible no es válida.";
  if (form.iva_aplicado && (!Number.isFinite(iva) || iva < 0 || iva > 100)) return "El porcentaje de IVA debe estar entre 0 y 100.";
  if (!form.iva_aplicado && Number(form.iva_porcentaje || 0) !== 0) return "Si el IVA no se aplica, el porcentaje debe ser 0.";
  if (form.irpf_aplicado && (!Number.isFinite(irpf) || irpf <= 0 || irpf > 100)) return "El porcentaje de IRPF debe ser mayor que 0 y menor o igual que 100.";
  if (!form.irpf_aplicado && Number(form.irpf_porcentaje || 0) !== 0) return "Si el IRPF no se aplica, el porcentaje debe ser 0.";
  if (form.fecha_emision && form.fecha_vencimiento && form.fecha_vencimiento < form.fecha_emision) return "La fecha de vencimiento no puede ser anterior a la fecha de emisión.";
  if (form.rectifies_invoice_id && !form.rectification_reason.trim()) return "Indica el motivo de la rectificación.";
  if (form.rectification_reason.length > 2000) return "El motivo de rectificación no puede superar 2000 caracteres.";
  return null;
}

export const MAX_INVOICE_PDF_SIZE = 10 * 1024 * 1024;
export function isPdfFile(file: File) { return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"); }
export function getCompanyName(companies: Company[], id: string | null | undefined) { return companies.find((company) => String(company.id) === String(id))?.company_name || "Sin empresa"; }
export function getProjectName(projects: Project[], id: string | null | undefined) { return projects.find((project) => String(project.id) === String(id))?.nombre || "Sin proyecto"; }
export function getCompanyCurrency(companies: Company[], id: string | null | undefined) { return companies.find((company) => String(company.id) === String(id))?.currency || "EUR"; }
