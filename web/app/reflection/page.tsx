import { AppShell } from "@/components/ui/AppShell";
import { ReflectionPreferenceManager } from "@/components/reflection/ReflectionPreferenceManager";

export const dynamic = "force-dynamic";

export default function ReflectionPage() {
  return (
    <AppShell route="/reflection" title="思考问题" description="设置反思内容的目标与边界；对话模式在聊天页切换。">
      <ReflectionPreferenceManager />
    </AppShell>
  );
}
