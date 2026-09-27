import { getVoiceProfileApi } from "@/lib/api/voiceProfileApi";

export const dynamic = "force-dynamic";

export function GET() {
  return getVoiceProfileApi().get();
}

export function PATCH(request: Request) {
  return getVoiceProfileApi().update(request);
}
