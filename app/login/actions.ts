"use server";

import { googleAuthConfigured, signIn, signOut } from "@/auth";

export async function signInWithGoogle() {
  if (!googleAuthConfigured()) return;
  await signIn("google", { redirectTo: "/" });
}

export async function signOutOfDashboard() {
  await signOut({ redirectTo: "/login" });
}
