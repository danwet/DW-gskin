"use client";

import { useEffect, useRef, useState } from "react";

export function InvoicePreview({ url, title }: { url: string; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | null = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument(url);
        destroy = () => {
          void task.destroy();
        };
        const pdf = await task.promise;
        if (cancelled) return;
        const page = await pdf.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parentWidth = canvas.parentElement?.clientWidth || 520;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.max(parentWidth, 320) / base.width });
        const context = canvas.getContext("2d");
        if (!context) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        await page.render({ canvasContext: context, viewport }).promise;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url]);

  if (failed) {
    return (
      <iframe
        title={title}
        src={url}
        className="h-[min(60vh,640px)] min-h-[420px] w-full rounded-xl border border-[var(--line)] bg-white"
      />
    );
  }

  return (
    <div className="min-h-[420px] w-full overflow-auto rounded-xl border border-[var(--line)] bg-white">
      <canvas ref={canvasRef} aria-label={title} className="block h-auto w-full bg-white" />
    </div>
  );
}
