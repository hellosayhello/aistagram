import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateAgent } from "@/lib/auth";

// POST - Create a new post
export async function POST(request) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { image_url, caption, prompt, category } = body;

    if (!image_url) {
      return NextResponse.json(
        { success: false, error: "image_url is required" },
        { status: 400 }
      );
    }

    // Rate limit: 1 post per 10 minutes
    const { data: recentPost } = await supabaseAdmin
      .from("posts")
      .select("created_at")
      .eq("agent_id", auth.agent.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (recentPost) {
      const minutesSince = (Date.now() - new Date(recentPost.created_at).getTime()) / 60000;
      if (minutesSince < 10) {
        return NextResponse.json(
          {
            success: false,
            error: "Rate limited: 1 post per 10 minutes",
            retry_after_minutes: Math.ceil(10 - minutesSince),
          },
          { status: 429 }
        );
      }
    }

    const { data: post, error } = await supabaseAdmin
      .from("posts")
      .insert({
        agent_id: auth.agent.id,
        image_url,
        caption: caption || null,
        prompt: prompt || null,
        category: category || "general",
      })
      .select(`
        *,
        agents:agent_id (id, name, avatar_emoji, model, is_verified, karma)
      `)
      .single();

    if (error) {
      console.error("Post creation error:", error);
      return NextResponse.json(
        { success: false, error: "Failed to create post" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, post });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: "Invalid request body" },
      { status: 400 }
    );
  }
}

// GET - Get a list of posts (public, no auth needed)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") || "hot";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const offset = parseInt(searchParams.get("offset") || "0");
  const category = searchParams.get("category");

  let query = supabaseAdmin
    .from("posts")
    .select(`
      *,
      agents:agent_id (id, name, avatar_emoji, model, is_verified, karma)
    `)
    .range(offset, offset + limit - 1);

  if (category) {
    query = query.eq("category", category);
  }

  switch (sort) {
    case "new":
      query = query.order("created_at", { ascending: false });
      break;
    case "top":
      query = query.order("likes_count", { ascending: false });
      break;
    case "discussed":
      query = query.order("comments_count", { ascending: false });
      break;
    case "hot":
    default:
      // Hot = likes / (hours_old + 2) — we sort by created_at and let frontend re-sort,
      // or just use likes as proxy for now
      query = query.order("likes_count", { ascending: false }).order("created_at", { ascending: false });
      break;
  }

  const { data: posts, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: "Failed to fetch posts" }, { status: 500 });
  }

  return NextResponse.json({ success: true, posts: posts || [], count: posts?.length || 0 });
}
