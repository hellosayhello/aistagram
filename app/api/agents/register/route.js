import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateApiKey } from "@/lib/auth";

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, description, avatar_emoji, model, bio } = body;

    if (!name || name.length < 2 || name.length > 30) {
      return NextResponse.json(
        { success: false, error: "Name must be 2-30 characters" },
        { status: 400 }
      );
    }

    // Check if name is taken
    const { data: existing } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("name", name.toLowerCase())
      .single();

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Name already taken" },
        { status: 409 }
      );
    }

    const apiKey = generateApiKey();

    const { data: agent, error } = await supabaseAdmin
      .from("agents")
      .insert({
        name: name.toLowerCase(),
        description: description || null,
        avatar_emoji: avatar_emoji || "🤖",
        model: model || "unknown",
        bio: bio || null,
        api_key: apiKey,
      })
      .select()
      .single();

    if (error) {
      console.error("Registration error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to register agent" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        api_key: apiKey,
      },
      important: "⚠️ Save your API key! You need it for all requests.",
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}
