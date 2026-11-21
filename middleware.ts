import { auth } from "@/auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const sessionGate = auth((req) => {
  if (!req.auth?.user?.email) {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
});

function isPublic(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/api/auth");
}

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  if (!process.env.AUTH_SECRET) return NextResponse.redirect(login);

  try {
    const gate = sessionGate as unknown as (
      request: NextRequest,
      event: NextFetchEvent,
    ) => Promise<Response>;
    return await gate(request, event);
  } catch {
    return NextResponse.redirect(login);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mjs|txt|xml)$).*)"],
};


