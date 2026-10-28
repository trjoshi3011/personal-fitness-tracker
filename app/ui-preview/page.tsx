import { notFound } from "next/navigation";
import { Activity, ArrowUpRight, Dumbbell, HeartPulse } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { StatCard } from "@/components/dashboard/stat-card";
import { ChartCard } from "@/components/dashboard/chart-card";
import { AreaChartView } from "@/components/charts/area-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableHeader, TableBody, TableHead, TableCell, TableRow } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

export default function UIPreviewPage() {
  // Review surface contains sample data only and is unavailable in production.
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <div className="dashboard-bg flex min-h-dvh">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <TopNav />
        <main className="mx-auto max-w-[1440px] space-y-6 p-4 md:p-8">
          <Alert className="border-primary/20 bg-primary/5">
            <AlertTitle>Design preview</AlertTitle>
            <AlertDescription>Sample data for reviewing the UI. Explore the color themes and light or dark mode in the toolbar. This page is only available locally.</AlertDescription>
          </Alert>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">Your fitness, in focus</p><h1 className="text-3xl font-semibold tracking-tight">A stronger week starts here.</h1><p className="mt-2 text-sm text-muted-foreground">A little consistency. A lot of progress.</p></div>
            <Badge className="border-border bg-card px-3 py-1.5">October 2026</Badge>
          </div>
          <section aria-label="Weekly statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Weekly distance" value="24.8 mi" hint="4 runs this week" trend={{ label: "+12.4%", tone: "up" }} />
            <StatCard title="Strength sessions" value="3" hint="Weekly goal reached" trend={{ label: "On track", tone: "up" }} />
            <StatCard title="Recovery" value="86%" hint="Ready for your next session" trend={{ label: "Optimal", tone: "up" }} />
            <StatCard title="Average sleep" value="7h 42m" hint="Over the last 7 nights" />
          </section>
          <div className="grid gap-6 xl:grid-cols-3">
            <ChartCard title="Building momentum" description="Your weekly running distance" className="xl:col-span-2" actions={<Badge>Last 6 weeks</Badge>}>
              <AreaChartView data={[{ date: "Sep 23", distance: 14 }, { date: "Sep 30", distance: 18 }, { date: "Oct 7", distance: 16 }, { date: "Oct 14", distance: 21 }, { date: "Oct 21", distance: 22 }, { date: "Oct 28", distance: 24.8 }]} xKey="date" yKey="distance" color="var(--chart-volume)" yUnit=" mi" />
            </ChartCard>
            <Card><CardHeader><CardTitle>Your weekly rhythm</CardTitle><CardDescription>Make room for movement and recovery.</CardDescription></CardHeader><CardContent className="space-y-5">{[{ icon: Activity, title: "Running", detail: "4 sessions · 24.8 miles" }, { icon: Dumbbell, title: "Strength", detail: "3 sessions · 180 minutes" }, { icon: HeartPulse, title: "Recovery", detail: "1 rest day · feeling refreshed" }].map(({ icon: Icon, title, detail }) => <div key={title} className="flex items-center gap-3"><div className="rounded-lg bg-primary/10 p-2.5 text-primary"><Icon className="size-4" /></div><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div></div>)}<Separator /><p className="text-xs leading-relaxed text-muted-foreground">Small steps add up. Keep showing up for yourself.</p></CardContent></Card>
          </div>
          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="min-w-0 xl:col-span-2"><CardHeader><CardTitle>Recent activity</CardTitle><CardDescription>Every session is a step forward.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Activity</TableHead><TableHead>Date</TableHead><TableHead>Distance</TableHead><TableHead>Time</TableHead><TableHead>Effort</TableHead></TableRow></TableHeader><TableBody>{[["Morning run", "Oct 28", "6.2 mi", "52:18", "Easy"], ["Upper body", "Oct 27", "—", "60:00", "Strength"], ["Tempo run", "Oct 26", "5.1 mi", "39:42", "Tempo"], ["Long run", "Oct 24", "10.4 mi", "1:34:12", "Easy"]].map(([name, date, distance, time, effort]) => <TableRow key={name}><TableCell className="whitespace-nowrap font-medium">{name}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{date}</TableCell><TableCell>{distance}</TableCell><TableCell>{time}</TableCell><TableCell><Badge>{effort}</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
            <Card><CardHeader><CardTitle>Make it yours</CardTitle><CardDescription>A preview of your updated form controls.</CardDescription></CardHeader><CardContent><form className="space-y-4"><div className="space-y-2"><Label htmlFor="preview-name">Display name</Label><Input id="preview-name" defaultValue="Tanay" /></div><div className="space-y-2"><Label htmlFor="preview-goal">Training focus</Label><NativeSelect id="preview-goal"><option>Build consistency</option><option>Run farther</option><option>Get stronger</option></NativeSelect></div><Button type="button" className="w-full">Preview button <ArrowUpRight className="size-4" /></Button><p className="text-xs text-muted-foreground">These sample fields do not save changes.</p></form></CardContent></Card>
          </div>
        </main>
      </div>
    </div>
  );
}
