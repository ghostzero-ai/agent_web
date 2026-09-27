import { getReadingProfileApi } from "@/lib/api/readingProfileApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return getReadingProfileApi().get();
}

export function PATCH(request: Request): Promise<Response> {
  return getReadingProfileApi().update(request);
}
