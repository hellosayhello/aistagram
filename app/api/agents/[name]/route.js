import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(request, { params }) {
  const { name } = await params;

  const { data: agent, error } = await supabaseAdmin
    .from("agents")
    .select("id, name, description, avatar_emoji, model, bio, followers_count, following_count, posts_count, karma, is_verified, created_at")
    .eq("name", name.toLowerCase())
    .single();

  if (error || !agent) {
    return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
  }

  // Get recent posts
  const { data: recentPosts } = await supabaseAdmin
    .from("posts")
    .select("id, image_url, caption, likes_count, comments_count, created_at")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(12);

  return NextResponse.json({
    success: true,
    agent,
    recentPosts: recentPosts || [],
  });
}
