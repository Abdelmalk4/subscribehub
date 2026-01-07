import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

// Rate limiting configuration
const RATE_LIMIT_REQUESTS = 10; // requests per window per subscriber
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute window

interface CreateCheckoutRequest {
  project_id: string;
  plan_id: string;
  subscriber_id: string;
  telegram_user_id: number;
}

// Rate limit check function
async function checkRateLimit(supabase: any, identifier: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_identifier: identifier,
      p_endpoint: "create-checkout-session",
      p_limit: RATE_LIMIT_REQUESTS,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    });

    if (error) {
      console.error("Rate limit check error:", error);
      return { allowed: true }; // Fail open
    }

    return {
      allowed: data.allowed,
      retryAfter: data.retry_after,
    };
  } catch (err) {
    console.error("Rate limit exception:", err);
    return { allowed: true };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { project_id, plan_id, subscriber_id, telegram_user_id }: CreateCheckoutRequest = await req.json();

    console.log("Creating checkout session for:", { project_id, plan_id, subscriber_id, telegram_user_id });

    // Validate required fields
    if (!project_id || !plan_id || !subscriber_id || !telegram_user_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PHASE 6: Rate limiting check
    const rateLimitResult = await checkRateLimit(supabase, `checkout:${subscriber_id}`);
    if (!rateLimitResult.allowed) {
      console.warn(`Rate limit exceeded for subscriber ${subscriber_id}`);
      return new Response(JSON.stringify({ error: "Rate limit exceeded", retry_after: rateLimitResult.retryAfter }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rateLimitResult.retryAfter || 60) },
      });
    }

    // Security: Verify subscriber exists with matching telegram_user_id and project_id
    const { data: subscriber, error: subscriberError } = await supabase
      .from("subscribers")
      .select("id, status, telegram_user_id")
      .eq("id", subscriber_id)
      .eq("project_id", project_id)
      .eq("telegram_user_id", telegram_user_id)
      .single();

    if (subscriberError || !subscriber) {
      console.error("Subscriber validation failed:", subscriberError);
      return new Response(JSON.stringify({ error: "Invalid subscriber" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify subscriber is in a valid state for checkout
    const validStates = ["pending_payment", "expired", "awaiting_proof", "active"]; // Allow active for renewals
    if (!validStates.includes(subscriber.status)) {
      console.error("Subscriber not in valid state for checkout:", subscriber.status);
      return new Response(JSON.stringify({ error: "Subscriber cannot checkout in current state" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch plan details and verify it belongs to the project
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("*")
      .eq("id", plan_id)
      .eq("project_id", project_id)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      console.error("Plan not found or inactive:", planError);
      return new Response(JSON.stringify({ error: "Plan not found or inactive" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch project for context
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("project_name")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      console.error("Project not found:", projectError);
      return new Response(JSON.stringify({ error: "Project not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert price to cents
    const priceInCents = Math.round(plan.price * 100);
    const currency = (plan.currency || "USD").toLowerCase();

    // Create Stripe Checkout Session
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "mode": "payment",
        "success_url": `https://t.me/?payment=success`,
        "cancel_url": `https://t.me/?payment=cancelled`,
        "client_reference_id": subscriber_id,
        "line_items[0][price_data][currency]": currency,
        "line_items[0][price_data][product_data][name]": `${project.project_name} - ${plan.plan_name}`,
        "line_items[0][price_data][product_data][description]": plan.description || `${plan.duration_days} days subscription`,
        "line_items[0][price_data][unit_amount]": priceInCents.toString(),
        "line_items[0][quantity]": "1",
        "metadata[project_id]": project_id,
        "metadata[plan_id]": plan_id,
        "metadata[subscriber_id]": subscriber_id,
        "metadata[telegram_user_id]": telegram_user_id.toString(),
      }).toString(),
    });

    if (!stripeResponse.ok) {
      const errorData = await stripeResponse.text();
      console.error("Stripe API error:", errorData);
      return new Response(JSON.stringify({ error: "Failed to create checkout session", details: errorData }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await stripeResponse.json();
    console.log("Checkout session created:", session.id);

    // PHASE 5: Log audit event for checkout creation
    await supabase.rpc("log_audit_event", {
      p_user_id: null, // No authenticated user (telegram bot flow)
      p_action: "checkout_created",
      p_resource_type: "subscriber",
      p_resource_id: subscriber_id,
      p_changes: {
        plan_id,
        project_id,
        telegram_user_id,
        session_id: session.id,
        amount: plan.price,
        currency: plan.currency || "USD",
      },
    });

    return new Response(JSON.stringify({ 
      checkout_url: session.url,
      session_id: session.id 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating checkout session:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});