import { getMemorizationApi } from "@/lib/api/memorizationApi";

export const dynamic = "force-dynamic";

export async function GET() {
  return getMemorizationApi().list();
}

export async function POST(request: Request) {
  return getMemorizationApi().create(request);
}
