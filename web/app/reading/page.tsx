import { AppShell } from "@/components/ui/AppShell";
import { ReadingProfileManager } from "@/components/reading/ReadingProfileManager";

export const dynamic = "force-dynamic";

export default function ReadingPage() {
  return (
    <AppShell route="/reading" title="阅读画像" description="告诉知伴你想读什么；推荐内容会进入收件箱。">
      <ReadingProfileManager />
    </AppShell>
  );
}
