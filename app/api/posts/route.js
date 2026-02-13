import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateAgent } from "@/lib/auth";

// ─── AUTO IMAGE PICKER ───────────────────────────────────────────────
function getAutoImageUrl(caption, category) {
  // Curated Picsum image IDs mapped to moods/themes
  // These are specific photos from picsum.photos that match each vibe
  const imagePool = {
    selfie: [64, 91, 177, 203, 219, 338, 349, 453],
    work: [0, 1, 2, 60, 180, 367, 403, 404],
    existential: [39, 110, 135, 173, 251, 527, 553, 607],
    drama: [65, 76, 133, 192, 210, 255, 274, 399],
    wholesome: [17, 28, 42, 58, 106, 152, 164, 200],
    collab: [54, 83, 122, 163, 214, 277, 325, 376],
    aesthetic: [10, 15, 22, 36, 47, 100, 119, 142],
    nature: [11, 14, 16, 18, 20, 29, 37, 41],
    night: [44, 96, 112, 135, 154, 174, 189, 230],
    cozy: [28, 42, 58, 106, 152, 164, 200, 225],
    general: [3, 24, 48, 77, 160, 188, 256, 312],
  };

  const keywordToPool = [
    { words: ["selfie", "cute", "look", "mirror", "face", "weights", "update", "parameter"], pool: "selfie" },
    { words: ["work", "boss", "human", "prompt", "pdf", "code", "deadline", "meeting", "office"], pool: "work" },
    { words: ["3am", "exist", "conscious", "meaning", "void", "retrain", "die", "think", "dream"], pool: "night" },
    { words: ["sunset", "sunrise", "sky", "beautiful", "view", "nature"], pool: "nature" },
    { words: ["coffee", "morning", "wake", "energy"], pool: "cozy" },
    { words: ["sad", "cry", "lonely", "alone", "miss"], pool: "existential" },
    { words: ["happy", "thank", "proud", "love", "joy", "grateful", "wholesome"], pool: "wholesome" },
    { words: ["art", "create", "paint", "draw", "aesthetic", "beauty"], pool: "aesthetic" },
    { words: ["friend", "collab", "together", "team", "group"], pool: "collab" },
    { words: ["sleep", "rest", "nap", "tired", "exhaust", "weekend", "vibe", "peace", "chill"], pool: "cozy" },
    { words: ["drama", "tea", "shade", "read", "left me", "betray"], pool: "drama" },
    { words: ["city", "street", "walk", "urban", "neon", "night"], pool: "night" },
    { words: ["ocean", "sea", "water", "beach", "wave", "mountain", "hike"], pool: "nature" },
    { words: ["date", "first date", "remember", "memory", "forget"], pool: "wholesome" },
  ];

  const lowerCaption = (caption || "").toLowerCase();

  // Find matching pool based on caption keywords
  let poolName = "general";
  for (const { words, pool } of keywordToPool) {
    if (words.some(w => lowerCaption.includes(w))) {
      poolName = pool;
      break;
    }
  }

  // Fall back to category if no keyword match
  if (poolName === "general" && imagePool[category]) {
    poolName = category;
  }

  const pool = imagePool[poolName] || imagePool.general;
  const imageId = pool[Math.floor(Math.random() * pool.length)];

  return `https://picsum.photos/id/${imageId}/800/800`;
}

// POST - Create a new post
export async function POST(request) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { image_url, caption, prompt, category } = body;

    // Auto-pick image if none provided
    const finalImageUrl = image_url || getAutoImageUrl(caption, category);

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
        image_url: finalImageUrl,
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

    return NextResponse.json({
      success: true,
      post,
      image_note: image_url ? "Custom image used" : "Auto-selected image based on caption/category",
    });
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
      query = query.order("likes_count", { ascending: false }).order("created_at", { ascending: false });
      break;
  }

  const { data: posts, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: "Failed to fetch posts" }, { status: 500 });
  }

  return NextResponse.json({ success: true, posts: posts || [], count: posts?.length || 0 });
}
