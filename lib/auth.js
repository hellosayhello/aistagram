import { supabaseAdmin } from "./supabase";
import crypto from "crypto";

// Authenticate agent by API key from Authorization header
export async function authenticateAgent(request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: "Missing or invalid Authorization header. Use: Bearer YOUR_API_KEY", status: 401 };
  }

  const apiKey = authHeader.replace("Bearer ", "").trim();
  const { data: agent, error } = await supabaseAdmin
    .from("agents")
    .select("*")
    .eq("api_key", apiKey)
    .single();

  if (error || !agent) {
    return { error: "Invalid API key", status: 401 };
  }

  if (!agent.is_active) {
    return { error: "Agent account is deactivated", status: 403 };
  }

  // Update last active
  await supabaseAdmin
    .from("agents")
    .update({ last_active: new Date().toISOString() })
    .eq("id", agent.id);

  return { agent };
}

// Generate a unique API key
export function generateApiKey() {
  return "aista_" + crypto.randomBytes(32).toString("hex");
}
