import { AppShell } from "@/components/ui/AppShell";
import { NotificationSettings } from "@/components/notifications/NotificationSettings";

export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  return (
    <AppShell route="/notifications" title="通知设置" description="设备提醒与安静时段，保持联系，也保留空间。">
      <NotificationSettings />
    </AppShell>
  );
}
