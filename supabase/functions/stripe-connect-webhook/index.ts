import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// UNIFIED STRIPE CONNECT WEBHOOK
// Single endpoint for all connected accounts - no per-project webhook setup needed!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

// Rate limiting configuration
const RATE_LIMIT_REQUESTS = 100;
const RATE_LIMIT_WINDOW_SECONDS = 60;

// Verify Stripe signature
async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(",");
    let timestamp = "";
    let v1Signature = "";
    
    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key === "t") timestamp = value;
      if (key === "v1") v1Signature = value;
    }
    
    if (!timestamp || !v1Signature) return false;
    
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    
    return expectedSignature === v1Signature;
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

// Rate limit check
async function checkRateLimit(supabase: any, identifier: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_identifier: identifier,
      p_endpoint: "stripe-connect-webhook",
      p_limit: RATE_LIMIT_REQUESTS,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });
    if (error) {
      console.error("Rate limit check error:", error);
      return { allowed: true };
    }
    return { allowed: data.allowed, retryAfter: data.retry_after };
  } catch (err) {
    console.error("Rate limit exception:", err);
    return { allowed: true };
  }
}

// Send Telegram message
async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  return response.json();
}

// Create invite link
async function createInviteLink(botToken: string, channelId: string, subscriberName: string): Promise<string | null> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/createChatInviteLink`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId,
        name: `Subscription - ${subscriberName}`,
        member_limit: 1,
        creates_join_request: false,
      }),
    });
    const result = await response.json();
    if (result.ok) return result.result.invite_link;
    return null;
  } catch (error) {
    console.error("Error creating invite link:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload = await req.text();
    const signature = req.headers.get("stripe-signature");

    console.log("Stripe Connect webhook received");

    // Rate limiting
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rateLimitResult = await checkRateLimit(supabase, `stripe-connect:${clientIP}`);
    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify signature with PLATFORM webhook secret
    if (!signature) {
      console.error("Missing stripe-signature header");
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isValid = await verifyStripeSignature(payload, signature, stripeWebhookSecret);
    if (!isValid) {
      console.error("Invalid Stripe signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("Stripe signature verified");

    const event = JSON.parse(payload);
    console.log("Stripe event:", event.type, "ID:", event.id, "Account:", event.account);

    // CRITICAL: Get the connected account ID from the event
    // This tells us which project's payment this is for
    const connectedAccountId = event.account;
    
    if (!connectedAccountId) {
      // This might be a platform-level event, not a connect event
      console.log("No connected account in event, skipping (platform event)");
      return new Response(JSON.stringify({ received: true, skipped: "platform_event" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency check
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("event_source", "stripe_connect")
      .eq("event_id", event.id)
      .single();

    if (existingEvent) {
      console.log(`Duplicate event ${event.id} - already processed`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the project by connected account ID
    const { data: projects, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .filter("stripe_config->stripe_account_id", "eq", connectedAccountId);

    if (projectError || !projects || projects.length === 0) {
      console.error("No project found for connected account:", connectedAccountId);
      return new Response(JSON.stringify({ error: "Project not found for account" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const project = projects[0];
    console.log("Found project:", project.id, "for account:", connectedAccountId);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("Checkout completed:", JSON.stringify(session));

      const subscriberId = session.client_reference_id;
      const metadata = session.metadata || {};
      const planId = metadata.plan_id;
      const telegramUserId = metadata.telegram_user_id;

      if (!subscriberId) {
        console.error("Missing client_reference_id");
        return new Response(JSON.stringify({ error: "Missing subscriber ID" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch subscriber
      const { data: subscriber, error: subError } = await supabase
        .from("subscribers")
        .select("*, plans(*)")
        .eq("id", subscriberId)
        .single();

      if (subError || !subscriber) {
        console.error("Subscriber not found:", subError);
        return new Response(JSON.stringify({ error: "Subscriber not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify subscriber belongs to this project
      if (subscriber.project_id !== project.id) {
        console.error("Subscriber-project mismatch");
        return new Response(JSON.stringify({ error: "Subscriber-project mismatch" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Processing payment for subscriber:", subscriber.id);

      const plan = subscriber.plans;
      const durationDays = plan?.duration_days || 30;
      const wasActive = subscriber.status === "active";
      const currentExpiryDate = subscriber.expiry_date ? new Date(subscriber.expiry_date) : null;
      const now = new Date();
      const isExtension = wasActive && currentExpiryDate && currentExpiryDate > now;

      // Atomic payment processing
      const { data: paymentResult, error: rpcError } = await supabase.rpc("process_stripe_payment", {
        p_subscriber_id: subscriberId,
        p_duration_days: durationDays,
      });

      if (rpcError) {
        console.error("Payment processing error:", rpcError);
        return new Response(JSON.stringify({ error: "Payment processing failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log("Payment processed:", JSON.stringify(paymentResult));
      const expiryDate = new Date(paymentResult.expiry_date);

      // Create invite link if needed
      let inviteLink = subscriber.invite_link;
      if (!inviteLink || !wasActive) {
        inviteLink = await createInviteLink(
          project.bot_token,
          project.channel_id,
          subscriber.first_name || `User ${subscriber.telegram_user_id}`
        );
        if (inviteLink) {
          await supabase
            .from("subscribers")
            .update({ invite_link: inviteLink })
            .eq("id", subscriberId);
        }
      }

      // Send Telegram confirmation
      if (subscriber.telegram_user_id) {
        let message = "";
        if (isExtension) {
          message = `🎉 <b>Subscription Extended!</b>\n\n`;
          message += `✅ Your subscription has been extended.\n`;
          message += `📦 Plan: ${plan?.plan_name || "Subscription"}\n`;
          message += `📅 New expiry date: ${expiryDate.toLocaleDateString()}\n\n`;
          message += `Thank you for your continued support! 🙏`;
        } else {
          message = `🎉 <b>Payment Successful!</b>\n\n`;
          message += `✅ Your subscription is now active!\n`;
          message += `📦 Plan: ${plan?.plan_name || "Subscription"}\n`;
          message += `📅 Valid until: ${expiryDate.toLocaleDateString()}\n\n`;
          if (inviteLink) {
            message += `🔗 <b>Join the channel:</b>\n${inviteLink}\n\n`;
            message += `⚠️ This link can only be used once.`;
          } else {
            message += `Our team will grant you access shortly.`;
          }
        }
        await sendTelegramMessage(project.bot_token, subscriber.telegram_user_id, message);
        console.log("Sent Telegram confirmation");
      }

      // Audit log
      await supabase.rpc("log_audit_event", {
        p_user_id: null,
        p_action: "stripe_connect_payment_completed",
        p_resource_type: "subscriber",
        p_resource_id: subscriberId,
        p_changes: {
          stripe_event_id: event.id,
          session_id: session.id,
          project_id: project.id,
          connected_account_id: connectedAccountId,
          plan_id: planId,
          amount_total: session.amount_total,
          currency: session.currency,
          is_extension: isExtension,
          new_expiry_date: expiryDate.toISOString(),
        },
      });

      // Record for idempotency
      await supabase.from("webhook_events").insert({
        event_source: "stripe_connect",
        event_id: event.id,
        event_type: event.type,
        result: { status: "processed", subscriber_id: subscriberId, project_id: project.id }
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Stripe Connect webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
