import { supabase } from "@/lib/supabase";

export async function generateInvoicePdf(invoice: { id?: string }) {
  if (!invoice?.id) throw new Error("La factura no es válida.");

  const { data, error } = await supabase.functions.invoke("set-invoice-document-hash", {
    body: {
      invoice_id: invoice.id,
      action: "generate_invoice_document",
    },
  });

  if (error) {
    let message = error.message || "No se pudo generar el PDF oficial de la factura.";
    try {
      const body = await error.context?.json();
      message = body?.error || message;
    } catch {
      // Mantener el mensaje original.
    }
    throw new Error(message);
  }

  if (!data?.success || !data?.document_path || !/^[0-9a-f]{64}$/i.test(String(data.document_sha256 || ""))) {
    throw new Error("El backend no devolvió un documento de factura finalizado correctamente.");
  }

  return data;
}

export async function openInvoicePdf(invoice: any, download = false) {
  if (!invoice?.document_path) throw new Error("Esta factura todavía no tiene un PDF oficial.");

  const { data, error } = await supabase.storage
    .from("invoices")
    .createSignedUrl(
      invoice.document_path,
      300,
      download ? { download: `${invoice.numero_factura}.pdf` } : undefined,
    );

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("No se pudo generar el enlace seguro del PDF.");

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
