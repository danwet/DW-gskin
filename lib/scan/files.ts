import "server-only";

import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { supabaseDownloadScan, supabaseUploadScan } from "../supabase/kv";

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function scanDirectory(): string {
  return path.join(process.cwd(), "data", "scans");
}

export function storedNameFor(scanId: string, mime: string): string {
  return `${scanId}.${EXT_BY_MIME[mime] ?? "bin"}`;
}

function mimeForFileName(name: string): string {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
}

export async function saveScanFile(buffer: Buffer, mime: string): Promise<{ scanId: string; storedName: string; mime: string }> {
  const scanId = randomUUID();
  const storedName = storedNameFor(scanId, mime);

  const uploaded = await supabaseUploadScan(storedName, buffer, mime);
  if (uploaded) return { scanId, storedName, mime };

  // Local fallback (dev without Supabase). Read-only filesystems are tolerated.
  try {
    const dir = scanDirectory();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, storedName), buffer);
  } catch {
    // Persisting is best-effort here; Supabase Storage is the production path.
  }
  return { scanId, storedName, mime };
}

export async function readScanFile(storedName: string): Promise<{ buffer: Buffer; mime: string }> {
  const safeName = path.basename(storedName);

  const fromSupabase = await supabaseDownloadScan(safeName);
  if (fromSupabase) return { buffer: fromSupabase, mime: mimeForFileName(safeName) };

  const buffer = await readFile(path.join(scanDirectory(), safeName));
  return { buffer, mime: mimeForFileName(safeName) };
}
