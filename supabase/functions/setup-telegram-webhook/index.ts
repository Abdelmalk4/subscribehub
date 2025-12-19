import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SetupWebhookRequest {
  bot_token: string;
  project_id: string;
}

// Generate a webhook secret from bot token (must match telegram-bot-handler)
function generateWebhookSecret(botToken: string): string {
  let hash = 0;
  for (let i = 0; i < botToken.length; i++) {
    const char = botToken.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `wh_${Math.abs(hash).toString(36)}`;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bot_token, project_id }: SetupWebhookRequest = await req.json();

    if (!bot_token || !project_id) {
      console.error("Missing required parameters");
      return new Response(
        JSON.stringify({ success: false, error: "Missing bot_token or project_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Construct the webhook URL for this project
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const webhookUrl = `${supabaseUrl}/functions/v1/telegram-bot-handler?project_id=${project_id}`;
    
    // Generate the secret token for webhook authentication
    const secretToken = generateWebhookSecret(bot_token);

    console.log(`Setting up webhook for project ${project_id} to URL: ${webhookUrl}`);

    // Call Telegram API to set the webhook with secret_token for authentication
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${bot_token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "callback_query"],
          drop_pending_updates: true,
          secret_token: secretToken, // This will be sent as X-Telegram-Bot-Api-Secret-Token header
        }),
      }
    );

    const telegramResult = await telegramResponse.json();
    console.log("Telegram setWebhook response:", JSON.stringify(telegramResult));

    if (!telegramResult.ok) {
      console.error("Failed to set webhook:", telegramResult.description);
      return new Response(
        JSON.stringify({
          success: false,
          error: telegramResult.description || "Failed to set webhook",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optionally verify the webhook was set correctly
    const webhookInfoResponse = await fetch(
      `https://api.telegram.org/bot${bot_token}/getWebhookInfo`
    );
    const webhookInfo = await webhookInfoResponse.json();
    console.log("Webhook info:", JSON.stringify(webhookInfo));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Webhook configured successfully with authentication",
        webhook_url: webhookUrl,
        webhook_info: webhookInfo.result,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error setting up webhook:", error);
    // Return generic error to avoid information leakage
    return new Response(
      JSON.stringify({ success: false, error: "Failed to configure webhook" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
