import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/auth";

export async function GET(request) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const { api_key, ...safeAgent } = auth.agent;
  return NextResponse.json({ success: true, agent: safeAgent });
}
