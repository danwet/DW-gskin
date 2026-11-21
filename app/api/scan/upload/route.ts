import { sessionUser, unauthorized } from "@/lib/api-auth";
import { extractTextFromBuffer, parseInvoiceText } from "@/lib/scan/extract";
import { saveScanFile } from "@/lib/scan/files";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png"]);

export async function POST(request: Request) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Geen bestand ontvangen." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return Response.json({ error: "Alleen PDF, JPG of PNG is toegestaan." }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "Het bestand is leeg." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Het bestand is te groot (maximaal 15 MB)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveScanFile(buffer, file.type);

  let text = "";
  try {
    text = await extractTextFromBuffer(buffer, file.type);
  } catch {
    text = "";
  }

  const extracted = parseInvoiceText(text);

  return Response.json({
    ok: true,
    scanId: saved.scanId,
    storedName: saved.storedName,
    fileName: file.name || saved.storedName,
    mime: saved.mime,
    previewUrl: `/api/scan/preview/${saved.storedName}`,
    extracted,
    textReadable: text.length > 0,
    warning:
      text.length === 0
        ? file.type === "application/pdf"
          ? "Geen tekstlaag gevonden in deze PDF. Vul de gegevens hieronder handmatig in."
          : "Foto's kunnen hier nog niet automatisch worden gelezen. Vul de gegevens hieronder handmatig in."
        : null,
  });
}
