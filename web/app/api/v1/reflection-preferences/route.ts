import { getReflectionPreferenceApi } from "@/lib/api/reflectionPreferenceApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return getReflectionPreferenceApi().get();
}

export function PATCH(request: Request): Promise<Response> {
  return getReflectionPreferenceApi().update(request);
}
