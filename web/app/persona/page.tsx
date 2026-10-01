import { AppShell } from "@/components/ui/AppShell";
import { PersonaProfileManager } from "@/components/persona/PersonaProfileManager";

export const dynamic = "force-dynamic";

export default function PersonaPage() {
  return (
    <AppShell route="/persona" title="人格设置" description="调节表达风格，不改变事实与专业标准。">
      <PersonaProfileManager />
    </AppShell>
  );
}
