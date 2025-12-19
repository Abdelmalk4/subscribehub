import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidateRequest {
  bot_token: string;
  channel_id: string;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
}

async function validateBotToken(token: string): Promise<{ valid: boolean; bot?: TelegramUser; error?: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await response.json();
    
    if (!data.ok) {
      return { valid: false, error: data.description || "Invalid bot token" };
    }
    
    return { valid: true, bot: data.result };
  } catch (error) {
    console.error("Error validating bot token:", error);
    return { valid: false, error: "Failed to connect to Telegram API" };
  }
}

async function validateChannel(token: string, channelId: string): Promise<{ valid: boolean; chat?: TelegramChat; error?: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${channelId}`);
    const data = await response.json();
    
    if (!data.ok) {
      return { valid: false, error: data.description || "Invalid channel ID or bot not added to channel" };
    }
    
    const chat = data.result as TelegramChat;
    
    // Check if it's a channel or supergroup
    if (chat.type !== "channel" && chat.type !== "supergroup") {
      return { valid: false, error: "The chat must be a channel or supergroup" };
    }
    
    return { valid: true, chat };
  } catch (error) {
    console.error("Error validating channel:", error);
    return { valid: false, error: "Failed to connect to Telegram API" };
  }
}

async function checkBotAdminRights(token: string, channelId: string, botId: number): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getChatMember?chat_id=${channelId}&user_id=${botId}`);
    const data = await response.json();
    
    if (!data.ok) {
      return { valid: false, error: "Could not verify bot permissions" };
    }
    
    const member = data.result;
    
    if (member.status !== "administrator" && member.status !== "creator") {
      return { valid: false, error: "Bot must be an administrator in the channel" };
    }
    
    // Check for required permissions
    if (!member.can_invite_users) {
      return { valid: false, error: "Bot needs 'Invite Users via Link' permission" };
    }
    
    return { valid: true };
  } catch (error) {
    console.error("Error checking bot admin rights:", error);
    return { valid: false, error: "Failed to verify bot permissions" };
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bot_token, channel_id }: ValidateRequest = await req.json();

    console.log("Validating project setup...");
    console.log("Channel ID:", channel_id);

    // Validate inputs
    if (!bot_token || !channel_id) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Bot token and channel ID are required" 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate bot token format (should be numbers:alphanumeric)
    const botTokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
    if (!botTokenRegex.test(bot_token)) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Invalid bot token format. Expected format: 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ" 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate channel ID format (should start with -100 for supergroups/channels)
    if (!channel_id.startsWith("-100") && !channel_id.startsWith("@")) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "Invalid channel ID format. Should start with -100 or @ for username" 
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Step 1: Validate bot token
    console.log("Step 1: Validating bot token...");
    const botResult = await validateBotToken(bot_token);
    if (!botResult.valid) {
      return new Response(
        JSON.stringify({ valid: false, error: botResult.error, step: "bot_token" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Bot validated:", botResult.bot?.username);

    // Step 2: Validate channel
    console.log("Step 2: Validating channel...");
    const channelResult = await validateChannel(bot_token, channel_id);
    if (!channelResult.valid) {
      return new Response(
        JSON.stringify({ valid: false, error: channelResult.error, step: "channel" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Channel validated:", channelResult.chat?.title);

    // Step 3: Check bot admin rights
    console.log("Step 3: Checking bot admin rights...");
    const adminResult = await checkBotAdminRights(bot_token, channel_id, botResult.bot!.id);
    if (!adminResult.valid) {
      return new Response(
        JSON.stringify({ valid: false, error: adminResult.error, step: "permissions" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("All validations passed!");

    // All validations passed
    return new Response(
      JSON.stringify({
        valid: true,
        bot: {
          id: botResult.bot!.id,
          username: botResult.bot!.username,
          first_name: botResult.bot!.first_name,
        },
        channel: {
          id: channelResult.chat!.id,
          title: channelResult.chat!.title,
          type: channelResult.chat!.type,
          username: channelResult.chat!.username,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("Error in validate-project-setup:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
