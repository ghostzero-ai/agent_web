import { AppShell } from "@/components/ui/AppShell";
import { InboxManager } from "@/components/inbox/InboxManager";

export const dynamic = "force-dynamic";

export default function InboxPage() {
  return (
    <AppShell route="/inbox" title="收件箱" description="提醒、简报与 AI 任务结果，都在这里。">
      <InboxManager />
    </AppShell>
  );
}
