import { getModelCredentialApi } from "@/lib/api/modelCredentialApi";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return getModelCredentialApi().test(request);
}
