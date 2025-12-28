import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MembershipCheckRequest {
  subscriber_id?: string;
  subscriber_ids?: string[];
  update_database?: boolean;
}

interface MembershipResult {
  subscriber_id: string;
  telegram_user_id: number;
  is_member: boolean;
  status: string;
  error?: string;
}

async function checkChannelMembership(
  botToken: string,
  channelId: string,
  userId: number
): Promise<{ isMember: boolean; status: string }> {
  const url = `https://api.telegram.org/bot${botToken}/getChatMember`;
  
  console.log(`[check-channel-membership] Checking membership for user ${userId} in channel ${channelId}`);
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        chat_id: channelId, 
        user_id: userId 
      }),
    });

    const result = await response.json();
    console.log(`[check-channel-membership] Telegram API response:`, JSON.stringify(result));

    if (!result.ok) {
      // User not found in chat or other error
      if (result.error_code === 400 && result.description?.includes("user not found")) {
        return { isMember: false, status: "never_joined" };
      }
      console.error(`[check-channel-membership] Telegram API error:`, result.description);
      return { isMember: false, status: "unknown" };
    }

    const memberStatus = result.result?.status;
    // 'member', 'administrator', 'creator' = in channel
    // 'restricted' = might be in channel with limitations
    // 'left', 'kicked' = not in channel
    const isMember = ["member", "administrator", "creator", "restricted"].includes(memberStatus);
    
    console.log(`[check-channel-membership] User ${userId} status: ${memberStatus}, isMember: ${isMember}`);
    
    return { isMember, status: memberStatus };
  } catch (error) {
    console.error(`[check-channel-membership] Error checking membership:`, error);
    return { isMember: false, status: "unknown" };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[check-channel-membership] ====== Function invoked ======");

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[check-channel-membership] No authorization header");
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error("[check-channel-membership] Auth error:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[check-channel-membership] Authenticated user: ${user.id}`);

    // Parse request body
    const body: MembershipCheckRequest = await req.json();
    const { subscriber_id, subscriber_ids, update_database = true } = body;

    console.log(`[check-channel-membership] Request:`, JSON.stringify(body));

    // Get list of subscriber IDs to check
    const idsToCheck: string[] = subscriber_ids || (subscriber_id ? [subscriber_id] : []);
    
    if (idsToCheck.length === 0) {
      return new Response(
        JSON.stringify({ error: "No subscriber_id or subscriber_ids provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch subscribers with their project details
    const { data: subscribers, error: fetchError } = await supabase
      .from("subscribers")
      .select(`
        id,
        telegram_user_id,
        project_id,
        projects!inner(id, bot_token, channel_id, user_id)
      `)
      .in("id", idsToCheck);

    if (fetchError) {
      console.error("[check-channel-membership] Error fetching subscribers:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch subscribers" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!subscribers || subscribers.length === 0) {
      return new Response(
        JSON.stringify({ error: "No subscribers found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has access to these subscribers (owns the projects)
    const unauthorizedSubscribers = subscribers.filter(
      (s: any) => s.projects.user_id !== user.id
    );
    
    if (unauthorizedSubscribers.length > 0) {
      console.error("[check-channel-membership] Unauthorized access attempt");
      return new Response(
        JSON.stringify({ error: "Unauthorized access to one or more subscribers" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check membership for each subscriber
    const results: MembershipResult[] = [];
    
    for (const sub of subscribers) {
      const project = sub.projects as any;
      const botToken = project.bot_token;
      const channelId = project.channel_id;
      
      if (!botToken || !channelId) {
        results.push({
          subscriber_id: sub.id,
          telegram_user_id: sub.telegram_user_id,
          is_member: false,
          status: "unknown",
          error: "Missing bot_token or channel_id",
        });
        continue;
      }

      const { isMember, status } = await checkChannelMembership(
        botToken,
        channelId,
        sub.telegram_user_id
      );

      results.push({
        subscriber_id: sub.id,
        telegram_user_id: sub.telegram_user_id,
        is_member: isMember,
        status,
      });

      // Update database if requested
      if (update_database) {
        const updateData: any = {
          last_membership_check: new Date().toISOString(),
          channel_membership_status: status,
          channel_joined: isMember,
        };
        
        // Set channel_joined_at if first time we detect they joined
        if (isMember) {
          // Only set if not already set
          const { data: currentData } = await supabase
            .from("subscribers")
            .select("channel_joined_at")
            .eq("id", sub.id)
            .single();
          
          if (!currentData?.channel_joined_at) {
            updateData.channel_joined_at = new Date().toISOString();
          }
        }

        const { error: updateError } = await supabase
          .from("subscribers")
          .update(updateData)
          .eq("id", sub.id);

        if (updateError) {
          console.error(`[check-channel-membership] Error updating subscriber ${sub.id}:`, updateError);
        } else {
          console.log(`[check-channel-membership] Updated subscriber ${sub.id} membership status: ${status}`);
        }
      }
    }

    console.log(`[check-channel-membership] Completed. Checked ${results.length} subscribers`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        checked_count: results.length,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[check-channel-membership] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
