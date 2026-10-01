import { AppShell } from "@/components/ui/AppShell";
import { ProactivityManager } from "@/components/proactivity/ProactivityManager";

export const dynamic = "force-dynamic";

export default function ProactivityPage() {
  return (
    <AppShell route="/proactivity" title="主动问候" description="何时联系、因何联系，由你来决定。">
      <ProactivityManager />
    </AppShell>
  );
}
