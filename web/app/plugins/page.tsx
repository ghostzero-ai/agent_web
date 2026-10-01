import { AppShell } from "@/components/ui/AppShell";
import { PluginManager } from "@/components/plugins/PluginManager";

export const dynamic = "force-dynamic";

export default function PluginsPage() {
  return (
    <AppShell route="/plugins" title="活动插件" description="为学习与娱乐添加能力，按需启用和授权。">
      <PluginManager />
    </AppShell>
  );
}
