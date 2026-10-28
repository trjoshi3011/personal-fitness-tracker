import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTimezones } from "@/lib/timezones";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params?.next ?? "/overview";
  const timezones = getTimezones();
  const defaultTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  return (
    <div className="dashboard-bg min-h-dvh px-6 py-14">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div className="text-center">
          <p className="text-sm tracking-widest text-stone-500 uppercase">
            LockIn.
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
            {params?.error ? (
              <div className="rounded-xl border border-rose-500/20 bg-rose-50/60 p-3 text-sm text-rose-700">
                {params.error}
              </div>
            ) : null}

            <form action="/api/auth/signup" method="post" className="space-y-3">
              <Input type="hidden" name="next" value={next} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Label className="block">
                  <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                    First name
                  </div>
                  <Input
                    name="firstName"
                    required
                    className="mt-1 h-10 w-full px-3 text-sm"
                  />
                </Label>
                <Label className="block">
                  <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                    Last name
                  </div>
                  <Input
                    name="lastName"
                    required
                    className="mt-1 h-10 w-full px-3 text-sm"
                  />
                </Label>
              </div>
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
                  minLength={8}
                  className="mt-1 h-10 w-full px-3 text-sm"
                />
              </Label>
              <Label className="block">
                <div className="text-[10px] font-medium tracking-wider text-stone-500 uppercase">
                  Timezone
                </div>
                <NativeSelect
                  name="timezone"
                  required
                  defaultValue={
                    timezones.some((tz) => tz.value === defaultTimezone)
                      ? defaultTimezone
                      : "UTC"
                  }
                  className="mt-1 h-10 w-full px-3 text-sm"
                >
                  {timezones.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </NativeSelect>
              </Label>
              <Button type="submit" className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[color:var(--ui-accent)] px-4 text-sm font-medium text-[color:var(--color-text-inverse)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--ui-accent)_88%,#000)]">
                Create account
              </Button>
            </form>

            <div className="text-sm text-stone-600">
              Already have an account?{" "}
              <Link
                href={`/login?next=${encodeURIComponent(next)}`}
                className="font-medium text-[color:var(--ui-accent)] hover:underline"
              >
                Log in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

