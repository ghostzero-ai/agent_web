import { getModelCredentialApi } from "@/lib/api/modelCredentialApi";

export const runtime = "nodejs";

export async function GET() {
  return getModelCredentialApi().get();
}

export async function PUT(request: Request) {
  return getModelCredentialApi().put(request);
}

export async function DELETE() {
  return getModelCredentialApi().delete();
}
