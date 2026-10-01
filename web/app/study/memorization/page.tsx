import { AppShell } from "@/components/ui/AppShell";
import { MemorizationActivity } from "@/components/memorization/MemorizationActivity";

export const dynamic = "force-dynamic";

export default function MemorizationPage() {
  return (
    <AppShell route="/study/memorization" title="背书训练" description="导入材料 → 复述 → 反馈 → 间隔复习。">
      <MemorizationActivity />
    </AppShell>
  );
}
