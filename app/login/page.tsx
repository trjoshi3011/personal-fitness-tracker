import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{
    next?: string;
    error?: string;
    forgot?: string;
    reason?: string;
    password?: string;
  }>;
}) {
  const params = await searchParams;
  const next = params?.next ?? "/overview";

  return (
    <div className="dashboard-bg min-h-dvh px-6 py-14">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="text-center">
          <p className="text-sm tracking-widest text-stone-500 uppercase">
            LockIn.
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
            Log in
          </h1>
          <p className="mt-2 text-base leading-relaxed text-stone-600">
            Access your dashboard and connected accounts.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {params?.error ? (
              <div className="rounded-xl border border-rose-500/20 bg-rose-50/60 p-3 text-sm text-rose-700">
                {params.error}
              </div>
            ) : null}
            {params?.forgot === "ok" ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/60 p-3 text-sm text-emerald-700">
                {params.reason ?? "Password reset complete. Please log in."}
              </div>
            ) : null}
            {params?.forgot === "error" ? (
              <div className="rounded-xl border border-rose-500/20 bg-rose-50/60 p-3 text-sm text-rose-700">
                {params.reason ?? "Could not reset password."}
              </div>
            ) : null}
            {params?.password === "updated" ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-50/60 p-3 text-sm text-emerald-700">
                Password changed successfully. Log in with your new password.
              </div>
            ) : null}

            <form action="/api/auth/login" method="post" className="space-y-3">
              <Input type="hidden" name="next" value={next} />
              <Label className="block">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  Email
                </div>
                <Input
                  name="email"
                  type="email"
                  required
                  className="mt-1 h-10 w-full px-3 text-sm"
                />
              </Label>
              <Label className="block">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  Password
                </div>
                <Input
                  name="password"
                  type="password"
                  required
                  className="mt-1 h-10 w-full px-3 text-sm"
                />
              </Label>
              <Button type="submit" className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[color:var(--ui-accent)] px-4 text-sm font-medium text-[color:var(--color-text-inverse)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ui-accent)_88%,#000)]">
                Log in
              </Button>
            </form>

            <div className="text-sm text-stone-600">
              New here?{" "}
              <Link
                href={`/signup?next=${encodeURIComponent(next)}`}
                className="font-medium text-[color:var(--ui-accent)] hover:underline"
              >
                Create an account
              </Link>
            </div>

            <details className="rounded-xl border border-[color:var(--color-border-subtle)] bg-[color:var(--ui-accent-soft)] p-3">
              <summary className="cursor-pointer text-sm font-medium text-stone-700">
                Forgot my password
              </summary>
              <form
                action="/api/auth/forgot-password"
                method="post"
                className="mt-3 space-y-3"
              >
                <Label className="block">
                  <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                    Email
                  </div>
                  <Input
                    name="email"
                    type="email"
                    required
                    className="mt-1 h-10 w-full px-3 text-sm"
                  />
                </Label>
                <Label className="block">
                  <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                    New password
                  </div>
                  <Input
                    name="password"
                    type="password"
                    minLength={8}
                    required
                    className="mt-1 h-10 w-full px-3 text-sm"
                  />
                </Label>
                <Label className="block">
                  <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                    Confirm new password
                  </div>
                  <Input
                    name="confirmPassword"
                    type="password"
                    minLength={8}
                    required
                    className="mt-1 h-10 w-full px-3 text-sm"
                  />
                </Label>
                <Button type="submit" className="inline-flex h-9 items-center justify-center rounded-xl border border-[color:var(--color-border-default)] bg-card/70 px-3 text-sm font-medium text-[color:var(--color-text-secondary)] transition-all hover:border-[color:color-mix(in_srgb,var(--ui-accent)_45%,transparent)] hover:bg-[color:var(--ui-accent-soft)] hover:text-[color:var(--color-text-primary)]">
                  Reset password
                </Button>
              </form>
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

