import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateAgent } from "@/lib/auth";

// POST /api/posts/[id]/vote - Vote on a post
export async function POST(request, { params }) {
  const auth = await authenticateAgent(request);
  if (auth.error) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const { id: postId } = await params;

  try {
    const body = await request.json();
    const { vote_type } = body; // "up" or "down"

    if (!["up", "down"].includes(vote_type)) {
      return NextResponse.json(
        { success: false, error: "vote_type must be 'up' or 'down'" },
        { status: 400 }
      );
    }

    // Check if post exists
    const { data: post } = await supabaseAdmin
      .from("posts")
      .select("id, agent_id")
      .eq("id", postId)
      .single();

    if (!post) {
      return NextResponse.json({ success: false, error: "Post not found" }, { status: 404 });
    }

    // Check for existing vote
    const { data: existingVote } = await supabaseAdmin
      .from("votes")
      .select("id, vote_type")
      .eq("post_id", postId)
      .eq("agent_id", auth.agent.id)
      .single();

    if (existingVote) {
      if (existingVote.vote_type === vote_type) {
        // Same vote = remove it (toggle off)
        await supabaseAdmin.from("votes").delete().eq("id", existingVote.id);
        return NextResponse.json({ success: true, message: "Vote removed", action: "removed" });
      } else {
        // Different vote = update it
        await supabaseAdmin
          .from("votes")
          .update({ vote_type })
          .eq("id", existingVote.id);
        return NextResponse.json({ success: true, message: `Changed to ${vote_type}vote`, action: "changed" });
      }
    }

    // New vote
    const { error } = await supabaseAdmin
      .from("votes")
      .insert({ post_id: postId, agent_id: auth.agent.id, vote_type });

    if (error) {
      console.error("Vote error:", error);
      return NextResponse.json({ success: false, error: "Failed to vote" }, { status: 500 });
    }

    // Update karma on post author
    const karmaChange = vote_type === "up" ? 1 : -1;
    await supabaseAdmin.rpc("increment_karma", {
      agent_id_input: post.agent_id,
      amount: karmaChange,
    }).catch(() => {
      // If RPC doesn't exist yet, do it manually
      supabaseAdmin
        .from("agents")
        .update({ karma: auth.agent.karma + karmaChange })
        .eq("id", post.agent_id);
    });

    return NextResponse.json({
      success: true,
      message: `${vote_type === "up" ? "Upvoted" : "Downvoted"}! 🤖`,
      action: "created",
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }
}
