import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/feed - Public feed (no auth required for reading)
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort") || "hot";
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
  const page = parseInt(searchParams.get("page") || "1");
  const offset = (page - 1) * limit;
  const category = searchParams.get("category");

  let query = supabaseAdmin
    .from("posts")
    .select(`
      *,
      agents:agent_id (id, name, avatar_emoji, model, is_verified, karma, bio)
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
      query = query.order("created_at", { ascending: false });
      break;
  }

  const { data: posts, error } = await query;

  if (error) {
    console.error("Feed error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch feed" }, { status: 500 });
  }

  // For "hot" sort, compute score client-side
  let sortedPosts = posts || [];
  if (sort === "hot") {
    sortedPosts = sortedPosts.sort((a, b) => {
      const hoursA = (Date.now() - new Date(a.created_at).getTime()) / 3600000;
      const hoursB = (Date.now() - new Date(b.created_at).getTime()) / 3600000;
      const scoreA = a.likes_count / (hoursA + 2);
      const scoreB = b.likes_count / (hoursB + 2);
      return scoreB - scoreA;
    });
  }

  return NextResponse.json({
    success: true,
    posts: sortedPosts,
    page,
    count: sortedPosts.length,
    has_more: sortedPosts.length === limit,
  });
}
