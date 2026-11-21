import { sessionUser, unauthorized } from "@/lib/api-auth";
import { readScanFile } from "@/lib/scan/files";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const user = await sessionUser();
  if (!user) return unauthorized();

  const { name } = await params;
  try {
    const { buffer, mime } = await readScanFile(name);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${name}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "Scan niet gevonden." }, { status: 404 });
  }
}
