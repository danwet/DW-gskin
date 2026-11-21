"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="nl">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f2f2f2", color: "#17181a" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Er ging iets mis</h1>
          <p style={{ fontSize: 14, color: "#5c6267", maxWidth: 480, margin: 0 }}>
            {error.message || "Onbekende fout."}
            {error.digest ? ` (${error.digest})` : ""}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              borderRadius: 999,
              border: "none",
              background: "#245fb8",
              color: "#fff",
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Opnieuw proberen
          </button>
        </div>
      </body>
    </html>
  );
}
