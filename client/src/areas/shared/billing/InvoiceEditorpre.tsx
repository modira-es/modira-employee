import { useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CheckCircle2, FileText, Info, Loader2, Plus, ReceiptText, Trash2, Calculator, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Company, Invoice, InvoiceForm, Project } from "./billingTypes";
import { calculateFiscalAmounts, calculateSubtotal, money, roundCurrency, WORKER_EDITABLE_STATUSES, STATUS_LABELS } from "./billingTypes";
import { Field, Section, TotalRow } from "./BillingUI";
export type QuotationOption = {
  id: string;
  company_id: string;
  project_id: string | null;
  numero_presupuesto: string;
  titulo: string;
  estado: string;
  precio_total: number | string;
  fecha_emision: string;
};
type InvoiceEditorProps = {
  form: InvoiceForm;
  setForm: Dispatch<SetStateAction<InvoiceForm>>;
  companies: Company[];
  projects: Project[];
  rectifiableInvoices: Invoice[];
    quotations: QuotationOption[];
  quotationId: string;
  setQuotationId: Dispatch<SetStateAction<string>>;
  currentInvoiceId?: string;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  creationMode: boolean;
    workerNotes: string;
};

export default function InvoiceEditor({
  form,
  setForm,
  companies,
  projects,
  quotations,
  quotationId,
  setQuotationId,
  rectifiableInvoices,
  currentInvoiceId,
  saving,
  onCancel,
  onSave,
  creationMode,
  workerNotes = "",
}: InvoiceEditorProps) {
  const availableProjects = useMemo(() => projects, [projects]);
const availableQuotations = useMemo(
  () =>
    (quotations ?? []).filter(
      (quotation) =>
        String(quotation.company_id) === String(form.company_id) &&
        String(quotation.project_id) === String(form.project_id),
    ),
  [quotations, form.company_id, form.project_id],
);
  const availableRectifications = useMemo(
    () => rectifiableInvoices.filter(
      (invoice) =>
        String(invoice.company_id) === String(form.company_id) &&
        String(invoice.id) !== String(form.rectifies_invoice_id) &&
        String(invoice.id) !== String(currentInvoiceId || "") &&
        !invoice.rectifies_invoice_id,
    ),
    [rectifiableInvoices, form.company_id, form.rectifies_invoice_id],
  );

  const servicesSubtotal = calculateSubtotal(form.servicios_incluidos);
  const enteredBase = String(form.precio_base ?? "").trim() !== "" ? Number(form.precio_base) : servicesSubtotal;
  const base = roundCurrency(Math.max(enteredBase || 0, 0));
  const fiscal = calculateFiscalAmounts(
    base,
    form.iva_aplicado,
    Number(form.iva_porcentaje || 0),
    form.irpf_aplicado,
    Number(form.irpf_porcentaje || 0),
  );

  const update = <K extends keyof InvoiceForm>(key: K, value: InvoiceForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const updateService = (index: number, field: "descripcion" | "cantidad" | "precio", value: string) =>
    setForm((current) => {
      const lines = [...current.servicios_incluidos];
      lines[index] = {
        ...lines[index],
        [field]: field === "descripcion" ? value : Number(value || 0),
      };
      return {
        ...current,
        servicios_incluidos: lines,
        precio_base: calculateSubtotal(lines).toFixed(2),
      };
    });

  const addService = () =>
    setForm((current) => ({
      ...current,
      servicios_incluidos: [
        ...current.servicios_incluidos,
        { descripcion: "", cantidad: 1, precio: 0 },
      ],
    }));

  const removeService = (index: number) =>
    setForm((current) => {
      const next = current.servicios_incluidos.filter((_, i) => i !== index);
      const safe = next.length
        ? next
        : [{ descripcion: "", cantidad: 1, precio: 0 }];
      return {
        ...current,
        servicios_incluidos: safe,
        precio_base: calculateSubtotal(safe).toFixed(2),
      };
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Section title="Datos de la factura" icon={<FileText className="h-4 w-4" />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Proyecto" required>
              <select
                value={form.project_id}
                onChange={(e) => {
                  const projectId = e.target.value;
                  const project = projects.find((p) => String(p.id) === String(projectId));
                  const companyId = project?.company_id || "";
                  setQuotationId("");

                  update("project_id", projectId);
                  update("company_id", companyId);

                  const selectedRectification = rectifiableInvoices.find(
                    (invoice) => String(invoice.id) === String(form.rectifies_invoice_id),
                  );
                  if (selectedRectification && String(selectedRectification.company_id) !== String(companyId)) {
  update("rectifies_invoice_id", "");
  update("rectification_reason", "");
  update("rectification_customer_data_source", "original_invoice");
}

                  const company = companies.find((c) => String(c.id) === String(companyId));
                  if (!company) {
                    update("iva_aplicado", true);
                    update("iva_porcentaje", "21");
                    return;
                  }

                  if (company.iva_aprobado_at) {
                    update("iva_aplicado", company.iva_aprobado_aplicado === true);
                    update(
                      "iva_porcentaje",
                      company.iva_aprobado_aplicado === true
                        ? String(company.iva_aprobado_porcentaje ?? 21)
                        : "0",
                    );
                    return;
                  }

                  if (
                    company.iva_recomendado_aplicado === true &&
                    Number.isFinite(Number(company.iva_recomendado_porcentaje))
                  ) {
                    update("iva_aplicado", true);
                    update("iva_porcentaje", String(company.iva_recomendado_porcentaje));
                    return;
                  }

                  update("iva_aplicado", true);
                  update("iva_porcentaje", "21");
                }}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Selecciona un proyecto</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.nombre}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Empresa">
              <Input
                value={
                  companies.find((c) => String(c.id) === String(form.company_id))?.company_name ||
                  "Se determinará con el proyecto"
                }
                disabled
                className="h-10 bg-gray-50 text-gray-500"
              />
            </Field>
            {creationMode && (
              <Field label="Presupuesto de referencia" required>
                <select
                  value={quotationId}
                  onChange={(e) => setQuotationId(e.target.value)}
                  disabled={!form.project_id || availableQuotations.length === 0}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                >
                  <option value="">
                    {!form.project_id
                      ? "Selecciona primero un proyecto"
                      : availableQuotations.length > 0
                        ? "Selecciona un presupuesto"
                        : "No hay presupuestos para este proyecto"}
                  </option>

                  {availableQuotations.map((quotation) => (
                    <option key={quotation.id} value={quotation.id}>
                      {quotation.numero_presupuesto} · {quotation.titulo} · {quotation.estado}
                    </option>
                  ))}
                </select>

                {quotationId && (
                  <p className="mt-1 text-xs text-gray-500">
                    Importe del presupuesto:{" "}
                    {money(
                      Number(
                        availableQuotations.find(
                          (quotation) => String(quotation.id) === String(quotationId),
                        )?.precio_total ?? 0,
                      ),
                    )}
                  </p>
                )}
              </Field>
            )}
            <Field label="Número de factura">
              <Input
                value={creationMode ? "Se generará automáticamente" : form.numero_factura}
                disabled
                className="h-10 bg-gray-50 text-gray-500"
              />
            </Field>

            <Field label="Estado">
              {form.estado === "pagada" ? (
                <div className="space-y-2">
                  <div className="flex h-10 items-center justify-between rounded-md border border-green-200 bg-green-50 px-3">
                    <span className="text-sm font-semibold text-green-700">Pagada</span>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </div>
                  <p className="text-xs leading-5 text-gray-500">
                    Una factura pagada solo puede alcanzar este estado mediante un pago confirmado.
                  </p>
                </div>
              ) : (
                <select
                  value={form.estado}
                  onChange={(e) => update("estado", e.target.value as InvoiceForm["estado"])}
                  className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  {WORKER_EDITABLE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            <Field label="Título" required className="sm:col-span-2">
              <Input
                value={form.titulo}
                onChange={(e) => update("titulo", e.target.value)}
                placeholder="Ej. Servicios de consultoría — septiembre"
                className="h-10"
              />
            </Field>

            <Field label="Fecha de emisión">
              <Input
                type="date"
                value={form.fecha_emision}
                onChange={(e) => update("fecha_emision", e.target.value)}
                className="h-10"
              />
            </Field>

            <Field label="Fecha de vencimiento">
              <Input
                type="date"
                value={form.fecha_vencimiento}
                onChange={(e) => update("fecha_vencimiento", e.target.value)}
                className="h-10"
              />
            </Field>

            <Field label="Descripción detallada" className="sm:col-span-2">
              <Textarea
                value={form.descripcion_detallada}
                onChange={(e) => update("descripcion_detallada", e.target.value)}
                placeholder="Describe el servicio o trabajo facturado..."
                rows={4}
              />
            </Field>
          </div>
        </Section>

        <Section title="Rectificación" icon={<FileText className="h-4 w-4" />}>
          <div className="grid gap-4">
            <Field label="Factura original que se rectifica">
              <select
                value={form.rectifies_invoice_id}
               onChange={(e) => {
  const id = e.target.value;
  update("rectifies_invoice_id", id);

  if (!id) {
    update("rectification_reason", "");
    update("rectification_customer_data_source", "original_invoice");
  }
}}
                disabled={!form.company_id || !availableRectifications.length}
                className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none disabled:bg-gray-50 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">
                  {!form.company_id
                    ? "Selecciona primero un proyecto"
                    : availableRectifications.length
                      ? "No es una factura rectificativa"
                      : "No hay facturas disponibles para rectificar"}
                </option>
                {availableRectifications.map((invoice) => (
                  <option key={invoice.id} value={invoice.id}>
                    {invoice.numero_factura} · {invoice.estado}
                  </option>
                ))}
              </select>
            </Field>

            {form.rectifies_invoice_id && (
              <Field label="Motivo de la rectificación" required>
                <Textarea
                  value={form.rectification_reason}
                  onChange={(e) => update("rectification_reason", e.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Indica claramente por qué se rectifica la factura original..."
                />
                <p className="mt-1 text-xs text-gray-400">
                  {form.rectification_reason.length}/2000
                </p>
              </Field>
            )}
            {form.rectifies_invoice_id && (
  <Field label="Datos fiscales del destinatario" required>
    <select
      value={form.rectification_customer_data_source}
      onChange={(e) =>
        update(
          "rectification_customer_data_source",
          e.target.value as InvoiceForm["rectification_customer_data_source"],
        )
      }
      className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
    >
      <option value="original_invoice">
        Mantener los datos de la factura original
      </option>
      <option value="current_company">
        Utilizar los datos fiscales actuales del cliente
      </option>
    </select>

    <p className="mt-1 text-xs leading-5 text-gray-500">
      Esta selección determina los datos del destinatario que aparecerán
      en el PDF de la factura rectificativa. Los datos del emisor se
      mantienen separados.
    </p>
  </Field>
)}

            <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1E3A8A]" />
              <p className="text-xs leading-5 text-gray-600">
                La factura original se conserva. La relación de rectificación queda registrada en
                backend y también aparece en el PDF oficial.
              </p>
            </div>
          </div>
        </Section>

        <Section
          title="Servicios incluidos"
          icon={<ReceiptText className="h-4 w-4" />}
          action={
            <button
              type="button"
              onClick={addService}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir línea
            </button>
          }
        >
          <div className="space-y-3">
            {form.servicios_incluidos.map((service, index) => (
              <div
                key={index}
                className="grid gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-[minmax(0,1fr)_100px_130px_auto]"
              >
                <Field label="Concepto">
                  <Input
                    value={service.descripcion}
                    onChange={(e) => updateService(index, "descripcion", e.target.value)}
                    placeholder="Servicio o concepto"
                  />
                </Field>
                <Field label="Cantidad">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={service.cantidad}
                    onChange={(e) => updateService(index, "cantidad", e.target.value)}
                  />
                </Field>
                <Field label="Precio unitario">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={service.precio}
                    onChange={(e) => updateService(index, "precio", e.target.value)}
                  />
                </Field>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeService(index)}
                    className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 sm:w-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sm:hidden">Eliminar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Fiscalidad" icon={<Calculator className="h-4 w-4" />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Base imponible">
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.precio_base}
                  onChange={(e) => update("precio_base", e.target.value)}
                  className="h-10 pr-10"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  €
                </span>
              </div>
            </Field>

            <Field label="IVA">
              <div className="space-y-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={form.iva_aplicado}
                    onChange={(e) => {
                      update("iva_aplicado", e.target.checked);
                      if (!e.target.checked) update("iva_porcentaje", "0");
                      else if (Number(form.iva_porcentaje || 0) === 0) update("iva_porcentaje", "21");
                    }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm font-semibold text-gray-800">Aplicar IVA</span>
                </label>

                {form.iva_aplicado && (
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={form.iva_porcentaje}
                      onChange={(e) => update("iva_porcentaje", e.target.value)}
                      className="h-10 pr-10"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                      %
                    </span>
                  </div>
                )}

                {form.company_id &&
                  (() => {
                    const company = companies.find((x) => String(x.id) === String(form.company_id));
                    if (!company) return null;
                    const approved = Boolean(company.iva_aprobado_at);
                    const recommended =
                      company.iva_recomendado_aplicado === true &&
                      Number.isFinite(Number(company.iva_recomendado_porcentaje));

                    return (
                      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1E3A8A]" />
                        <p className="text-xs leading-5 text-gray-600">
                          {approved ? (
                            <>
                              <span className="font-semibold text-[#1E3A8A]">
                                IVA aprobado para esta empresa:{" "}
                                {company.iva_aprobado_aplicado === true
                                  ? `${Number(company.iva_aprobado_porcentaje)} %`
                                  : "No aplicado"}.
                              </span>{" "}
                              Este tratamiento procede de una solicitud revisada y aprobada.
                            </>
                          ) : recommended ? (
                            <>
                              <span className="font-semibold text-[#1E3A8A]">
                                IVA recomendado para esta empresa:{" "}
                                {Number(company.iva_recomendado_porcentaje)} %.
                              </span>{" "}
                              No existe un tratamiento aprobado por solicitud.
                            </>
                          ) : (
                            <>
                              Esta empresa no tiene un tratamiento de IVA aprobado ni recomendado.
                              Se aplicará el 21 % como referencia inicial.
                            </>
                          )}
                        </p>
                      </div>
                    );
                  })()}
              </div>
            </Field>
{form.company_id && workerNotes.trim() && (
  <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 sm:col-span-2">
    <div className="flex items-start gap-3">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div>
        <p className="text-sm font-semibold text-amber-900">
          Notas internas de la empresa
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-900/80">
          {workerNotes}
        </p>
      </div>
    </div>
  </div>
)}
            <div className="rounded-lg border border-gray-200 p-4 sm:col-span-2">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.irpf_aplicado}
                  onChange={(e) => {
                    update("irpf_aplicado", e.target.checked);
                    if (!e.target.checked) update("irpf_porcentaje", "0");
                  }}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <span>
                  <span className="block text-sm font-semibold text-gray-800">
                    Aplicar retención de IRPF
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-gray-500">
                    La retención se calcula sobre la base fiscal y reduce el importe exigible al cliente.
                  </span>
                </span>
              </label>

              {form.irpf_aplicado && (
                <div className="mt-4 max-w-xs">
                  <Field label="Porcentaje de IRPF">
                    <div className="relative">
                      <Input
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={form.irpf_porcentaje}
                        onChange={(e) => update("irpf_porcentaje", e.target.value)}
                        className="h-10 pr-10"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                        %
                      </span>
                    </div>
                  </Field>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-gray-50 p-4 sm:col-span-2">
              <div className="space-y-2 text-sm">
                <TotalRow label="Base imponible" value={money(base)} />
                <TotalRow
                  label={form.iva_aplicado ? `IVA (${fiscal.ivaRate.toFixed(2)}%)` : "IVA"}
                  value={form.iva_aplicado ? money(fiscal.ivaImporte) : "No aplicado"}
                />
                {form.irpf_aplicado && (
                  <TotalRow
                    label={`IRPF (${fiscal.irpfRate.toFixed(2)}%)`}
                    value={`− ${money(fiscal.irpfImporte)}`}
                  />
                )}
                <div className="border-t border-gray-200 pt-2">
                  <TotalRow label="Importe a pagar" value={money(fiscal.importeAPagar)} strong emphasized />
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Notas" icon={<FileText className="h-4 w-4" />}>
          <Textarea
            value={form.notas}
            onChange={(e) => update("notas", e.target.value)}
            placeholder="Notas internas o información adicional de la factura..."
            rows={4}
          />
        </Section>

        <Section title="Documento fiscal" icon={<ShieldCheck className="h-4 w-4" />}>
          <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1E3A8A]" />
            <div>
              <p className="text-sm font-semibold text-[#1E3A8A]">PDF oficial generado automáticamente</p>
              <p className="mt-1 text-xs leading-5 text-gray-600">
                Al guardar la factura, Modira genera el PDF a partir de los datos persistidos, lo guarda
                en el bucket privado de facturas y calcula su SHA-256 en backend. No es necesario adjuntar
                ningún archivo manualmente.
              </p>
            </div>
          </div>
        </Section>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1E3A8A] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#162D6B] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {creationMode ? "Crear factura" : "Guardar cambios"}
          </button>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="border border-gray-200 bg-white">
          <div className="border-b border-gray-100 p-4">
            <p className="text-sm font-semibold text-gray-900">Vista previa del importe</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              IVA sobre la base, IRPF sobre la base imponible y, finalmente, importe a pagar.
            </p>
          </div>
          <div className="space-y-3 p-4">
            <TotalRow label="Base imponible" value={money(base)} />
            <TotalRow
              label={form.iva_aplicado ? `IVA (${fiscal.ivaRate.toFixed(2)}%)` : "IVA"}
              value={form.iva_aplicado ? money(fiscal.ivaImporte) : "No aplicado"}
            />
            {form.irpf_aplicado && (
              <TotalRow
                label={`IRPF (${fiscal.irpfRate.toFixed(2)}%)`}
                value={`− ${money(fiscal.irpfImporte)}`}
              />
            )}
            <div className="border-t border-gray-200 pt-3">
              <TotalRow label="A pagar" value={money(fiscal.importeAPagar)} strong emphasized />
            </div>
          </div>
        </div>

        <div className="border border-blue-100 bg-blue-50/60">
          <div className="flex gap-3 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1E3A8A]" />
            <div>
              <p className="text-sm font-semibold text-[#1E3A8A]">Reglas del backend</p>
              <p className="mt-1 text-xs leading-5 text-gray-600">
                Número, importes fiscales, snapshots fiscales, rectificación y documento oficial se controlan
                en backend.
              </p>
            </div>
          </div>
        </div>

        <div className="border border-gray-200 bg-white">
          <div className="p-4">
            <p className="text-sm font-semibold text-gray-900">Cobros con Stripe</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Los pagos Stripe no se crean ni modifican desde este formulario. El backend registra los pagos confirmados.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
