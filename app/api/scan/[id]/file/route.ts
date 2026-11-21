import { sessionUser, unauthorized } from "@/lib/api-auth";
import { readAssessment } from "@/lib/agent/store";
import { readScanFile } from "@/lib/scan/files";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const item = await readAssessment(id);
  if (!item || !item.scanFilePath) {
    return Response.json({ error: "Scan niet gevonden." }, { status: 404 });
  }
  if (item.ownerId && item.ownerId !== user.id) {
    return Response.json({ error: "Geen toegang tot deze scan." }, { status: 403 });
  }

  try {
    const { buffer, mime } = await readScanFile(item.scanFilePath);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${item.scanFileName ?? item.scanFilePath}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "Scanbestand niet gevonden." }, { status: 404 });
  }
}
