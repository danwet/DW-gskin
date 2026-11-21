import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // pdfjs loads its own worker at runtime; bundling it broke that lookup on
  // Vercel ("Cannot find module pdf.worker.mjs"), so keep it external.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
