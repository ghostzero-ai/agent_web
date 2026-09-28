import { getProactivityApi } from "@/lib/api/proactivityApi";

export const dynamic = "force-dynamic";

export function GET() {
  return getProactivityApi().get();
}

export function PATCH(request: Request) {
  return getProactivityApi().update(request);
}

export function POST() {
  return getProactivityApi().evaluate();
}
