import { getGameSessionApi } from "@/lib/api/gameSessionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return getGameSessionApi().list();
}

export function POST(request: Request): Promise<Response> {
  return getGameSessionApi().create(request);
}
