import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // pdfjs loads its own worker at runtime; bundling it broke that lookup on
  // Vercel ("Cannot find module pdf.worker.mjs"), so keep it external.
  serverExternalPackages: ["pdfjs-dist"],
  // pdfjs imports this worker at runtime, so the tracer never saw it and the
  // file was missing on Vercel. Ship it with every API function.
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
