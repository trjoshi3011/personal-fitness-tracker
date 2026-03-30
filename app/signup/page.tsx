import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string };
}) {
  const next = searchParams?.next ?? "/overview";

  return (
    <div className="dashboard-bg min-h-dvh px-6 py-14">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="text-center">
          <p className="text-sm tracking-widest text-stone-500 uppercase">
            Personal fitness tracker
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
            Create account
          </h1>
          <p className="mt-2 text-base leading-relaxed text-stone-600">
            Sign up to save your Strava sync and dashboard history.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {searchParams?.error ? (
              <div className="rounded-xl border border-rose-500/20 bg-rose-50/60 p-3 text-sm text-rose-700">
                {searchParams.error}
              </div>
            ) : null}

            <form action="/api/auth/signup" method="post" className="space-y-3">
              <input type="hidden" name="next" value={next} />
              <label className="block">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  Email
                </div>
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
                />
              </label>
              <label className="block">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  Password
                </div>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  className="mt-1 h-10 w-full rounded-xl border border-amber-950/15 bg-card px-3 text-sm text-stone-900 outline-none focus:border-orange-500/40 focus:ring-2 focus:ring-orange-500/25"
                />
              </label>
              <button className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-stone-900 px-4 text-sm font-medium text-white transition-colors hover:bg-stone-800">
                Create account
              </button>
            </form>

            <div className="text-sm text-stone-600">
              Already have an account?{" "}
              <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-orange-700 hover:underline">
                Log in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

