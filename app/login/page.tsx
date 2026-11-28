import { auth, GOOGLE_CALLBACK_PATH, googleAuthConfigured } from "@/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signInWithGoogle } from "./actions";
import { BrandMark } from "@/components/BrandMark";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const configured = googleAuthConfigured();
  if (process.env.AUTH_SECRET) {
    try {
      const session = await auth();
      if (session?.user?.email) redirect("/");
    } catch {
      // A missing or unreadable session stays on the login page.
    }
  }

  const params = await searchParams;
  // De terugkeer-URL van Google moet die van het apparaat zijn dat inlogt.
  // AUTH_URL staat op localhost; op een telefoon via het netwerk-IP zou je dan
  // naar je eigen toestel worden gestuurd en "kan geen verbinding maken" zien.
  const kop = await headers();
  const gastheer = kop.get("x-forwarded-host") ?? kop.get("host") ?? "";
  const schema =
    kop.get("x-forwarded-proto") ??
    (/^(localhost|127\.|192\.168\.|10\.)/.test(gastheer) ? "http" : "https");
  const oorsprong = gastheer
    ? `${schema}://${gastheer}`
    : (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[480px] rounded-[22px] border border-[var(--line)] bg-[var(--card)] p-8 shadow-[var(--shadow)]">
        <BrandMark className="w-40" />
        <h1 className="mt-8 text-[32px] font-semibold tracking-[-0.04em]">
          {configured ? "Sign in" : "Set up sign-in"}
        </h1>
        <p className="mt-2 text-[15px] leading-6 text-[var(--muted)]">
          Your calendar stays with this Google account.
        </p>
        {configured ? (
          <form action={signInWithGoogle} className="mt-8">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-full bg-[var(--ink)] px-4 py-3 text-[14px] font-medium text-[var(--card)]"
            >
              <GoogleMark />
              Sign in with Google
            </button>
          </form>
        ) : (
          <GoogleSetup redirectUri={redirectUri(oorsprong)} />
        )}
        {params.error && configured ? (
          <p className="mt-4 text-[13px] leading-5 text-[var(--muted)]">
            Google sign-in did not finish. Nothing was signed in.
          </p>
        ) : null}
      </div>
    </main>
  );
}

function redirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}${GOOGLE_CALLBACK_PATH}`;
}

function GoogleSetup({ redirectUri }: { redirectUri: string }) {
  return (
    <div className="mt-8 space-y-4">
      <p className="rounded-2xl bg-[var(--bg)] px-4 py-3 text-[14px] leading-6 text-[var(--muted)]">
        Sign-in needs a Google OAuth client. Create a Web application client in Google Cloud, register the
        redirect URI below, then paste the client id and secret into{" "}
        <span className="font-medium text-[var(--ink)]">.env.local</span>.
      </p>
      <div>
        <p className="text-[12px] font-medium tracking-[0.12em] text-[var(--muted)]">REDIRECT URI</p>
        <p className="mt-2 break-all rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-[12px] leading-5 text-[var(--ink)] sm:break-normal sm:whitespace-nowrap">
          {redirectUri}
        </p>
      </div>
      <div className="rounded-2xl border border-[var(--line)] px-4 py-3 text-[14px] leading-6">
        <p className="text-[12px] font-medium tracking-[0.12em] text-[var(--muted)]">PASTE INTO .env.local</p>
        <p className="mt-3 font-mono text-[13px]">AUTH_GOOGLE_ID</p>
        <p className="text-[13px] text-[var(--muted)]">OAuth client id from Google Cloud</p>
        <p className="mt-3 font-mono text-[13px]">AUTH_GOOGLE_SECRET</p>
        <p className="text-[13px] text-[var(--muted)]">OAuth client secret from Google Cloud</p>
      </div>
      <p className="text-[13px] leading-5 text-[var(--muted)]">
        AUTH_SECRET and AUTH_URL are already set for local development. Restart the dev server after you paste
        the Google values. The Google button appears only then. Nothing is signed in until that works.
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5Z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.9 10.7A5.4 5.4 0 0 1 3.6 9c0-.6.1-1.2.3-1.7V5H.9A9 9 0 0 0 0 9c0 1.4.3 2.8.9 4l3-2.3Z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6C13.5.9 11.4 0 9 0A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6Z" />
    </svg>
  );
}
