import { supabase } from "@/lib/supabase";
import { MAX_INVOICE_PDF_SIZE, isPdfFile } from "./billingTypes";

export async function uploadInvoicePdf(invoice: any, file: File) {
  if (!file) return;
  if (!invoice?.id) throw new Error("La factura no es válida.");
  if (!invoice?.numero_factura) throw new Error("La factura no tiene un número válido para su documento.");
  if (!isPdfFile(file)) throw new Error("Solo se permiten archivos PDF.");
  if (file.size <= 0) throw new Error("El PDF seleccionado está vacío.");
  if (file.size > MAX_INVOICE_PDF_SIZE) throw new Error("El PDF no puede superar los 10 MB.");
  const path = `${invoice.numero_factura}.pdf`;
  const hadExistingDocument = Boolean(String(invoice.document_path || "").trim());
  const { error: uploadError } = await supabase.storage.from("invoices").upload(path, file, { cacheControl: "3600", upsert: true, contentType: "application/pdf" });
  if (uploadError) throw uploadError;
  const { error: attachError } = await supabase.rpc("attach_invoice_document", { p_invoice_id: invoice.id, p_document_path: path });
  if (attachError) {
    if (!hadExistingDocument) await supabase.storage.from("invoices").remove([path]);
    throw attachError;
  }
  const { data: hashData, error: hashError } = await supabase.functions.invoke("set-invoice-document-hash", { body: { invoice_id: invoice.id } });
  if (hashError) {
    let message = hashError.message || "El PDF se ha adjuntado, pero no se ha podido validar su huella digital.";
    try { const body = await hashError.context?.json(); message = body?.error || message; } catch { /* keep original */ }
    throw new Error(message);
  }
  if (!hashData?.success || !hashData?.document_sha256 || !/^[0-9a-f]{64}$/i.test(String(hashData.document_sha256))) throw new Error("El PDF se ha adjuntado, pero no se ha podido validar correctamente su huella digital.");
  return path;
}

export async function openInvoicePdf(invoice: any, download = false) {
  if (!invoice?.document_path) throw new Error("Esta factura todavía no tiene un PDF adjunto.");
  const { data, error } = await supabase.storage.from("invoices").createSignedUrl(invoice.document_path, 300, download ? { download: `${invoice.numero_factura}.pdf` } : undefined);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("No se pudo generar el enlace seguro del PDF.");
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
