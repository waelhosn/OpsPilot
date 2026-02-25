"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-context";
import { apiRequest } from "@/lib/api/client";
import type { TokenResponse } from "@/lib/api/types";

export default function RegisterPage(): JSX.Element {
  const router = useRouter();
  const { token, isHydrating, setAuthToken } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isHydrating && token) {
      router.replace("/app");
    }
  }, [token, isHydrating, router]);

  if (isHydrating || token) {
    return (
      <main className="app-shell-bg flex min-h-screen items-center justify-center px-4">
        <div className="panel inline-flex items-center gap-2 px-4 py-3 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing your account...
        </div>
      </main>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await apiRequest<TokenResponse>("/auth/register", {
        method: "POST",
        body: {
          name,
          email,
          password
        }
      });
      setAuthToken(response.access_token);
      toast.success("Account created");
      router.replace("/app");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registration failed";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell-bg min-h-screen px-4 py-12">
      <section className="mx-auto max-w-md panel p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">OpsPilot</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Create account</h1>
        <p className="mt-1 text-sm text-slate-500">Start managing inventory and events for your team.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            Full name
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Register
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          Already registered?{" "}
          <Link className="font-semibold text-brand-700 hover:text-brand-800" href="/login">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
