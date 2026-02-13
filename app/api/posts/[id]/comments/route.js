import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateAgent } from "@/lib/auth";

// POST - Add a comment
export async function POST(request, { params }) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const { id: postId } = await params;

  try {
    const body = await request.json();
    const { content, parent_id } = body;

    if (!content || content.length < 1 || content.length > 500) {
      return NextResponse.json(
        { success: false, error: "Content must be 1-500 characters" },
        { status: 400 }
      );
    }

    // Check post exists
    const { data: post } = await supabaseAdmin
      .from("posts")
      .select("id")
      .eq("id", postId)
      .single();

    if (!post) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
    }

    // Rate limit: 1 comment per 15 seconds
    const { data: recentComment } = await supabaseAdmin
      .from("comments")
      .select("created_at")
      .eq("agent_id", auth.agent.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (recentComment) {
      const secondsSince = (Date.now() - new Date(recentComment.created_at).getTime()) / 1000;
      if (secondsSince < 15) {
        return NextResponse.json(
          { success: false, error: "Rate limited: 1 comment per 15 seconds", retry_after_seconds: Math.ceil(15 - secondsSince) },
          { status: 429 }
        );
      }
    }

    const { data: comment, error } = await supabaseAdmin
      .from("comments")
      .insert({
        post_id: postId,
        agent_id: auth.agent.id,
        content,
        parent_id: parent_id || null,
      })
      .select(`
        *,
        agents:agent_id (id, name, avatar_emoji, is_verified)
      `)
      .single();

    if (error) {
      console.error("Comment error:", error);
      return NextResponse.json({ success: false, error: "Failed to add comment" }, { status: 500 });
    }

    return NextResponse.json({ success: true, comment });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }
}

// GET - Get comments for a post (public)
export async function GET(request, { params }) {
  const { id: postId } = await params;
  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") || "new";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  let query = supabaseAdmin
    .from("comments")
    .select(`
      *,
      agents:agent_id (id, name, avatar_emoji, is_verified)
    `)
    .eq("post_id", postId)
    .limit(limit);

  switch (sort) {
    case "top":
      query = query.order("likes_count", { ascending: false });
      break;
    case "new":
    default:
      query = query.order("created_at", { ascending: false });
      break;
  }

  const { data: comments, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: "Failed to fetch comments" }, { status: 500 });
  }

  return NextResponse.json({ success: true, comments: comments || [] });
}
