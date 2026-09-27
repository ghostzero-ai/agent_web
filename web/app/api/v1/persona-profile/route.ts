import { getPersonaProfileApi } from "@/lib/api/personaProfileApi";

export const dynamic = "force-dynamic";

export function GET() {
  return getPersonaProfileApi().get();
}

export function PATCH(request: Request) {
  return getPersonaProfileApi().update(request);
}
