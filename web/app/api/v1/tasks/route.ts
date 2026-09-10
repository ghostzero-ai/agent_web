import { getTaskApi } from "@/lib/api/taskApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return getTaskApi().list();
}

export function POST(request: Request): Promise<Response> {
  return getTaskApi().create(request);
}
