import { AppShell } from "@/components/ui/AppShell";
import { QuickAdventureActivity } from "@/components/gameRulePacks/QuickAdventureActivity";

export default function QuickAdventurePage() {
  return (
    <AppShell route="/entertainment/quick-adventure" title="轻量冒险" description="选择世界与主角，再确认创建游戏。">
      <QuickAdventureActivity />
    </AppShell>
  );
}
