import { AppShell } from "@/components/ui/AppShell";
import { VoiceProfileManager } from "@/components/voice/VoiceProfileManager";

export const dynamic = "force-dynamic";

export default function VoicePage() {
  return (
    <AppShell route="/voice" title="语音设置" description="找到适合你的音线，先试听，再保存。">
      <VoiceProfileManager />
    </AppShell>
  );
}
