import { getProblemSolvingApi } from "@/lib/api/problemSolvingApi";

export const dynamic = "force-dynamic";

export async function GET() {
  return getProblemSolvingApi().list();
}

export async function POST(request: Request) {
  return getProblemSolvingApi().create(request);
}
