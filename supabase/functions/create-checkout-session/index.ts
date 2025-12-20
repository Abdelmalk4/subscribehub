import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

interface CreateCheckoutRequest {
  project_id: string;
  plan_id: string;
  subscriber_id: string;
  telegram_user_id: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { project_id, plan_id, subscriber_id, telegram_user_id }: CreateCheckoutRequest = await req.json();

    // Log only that we're creating a session, not the actual IDs
    console.log("Creating checkout session");

    // Validate required fields
    if (!project_id || !plan_id || !subscriber_id || !telegram_user_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch plan details
    const { data: plan, error: planError } = await supabase
      .from("plans")
      .select("*")
      .eq("id", plan_id)
      .single();

    if (planError || !plan) {
      console.error("Plan not found");
      return new Response(JSON.stringify({ error: "Plan not found" }), {
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
      console.error("Project not found");
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
      console.error("Stripe API error");
      return new Response(JSON.stringify({ error: "Failed to create checkout session" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await stripeResponse.json();
    // Log only that session was created, not the session ID
    console.log("Checkout session created successfully");

    return new Response(JSON.stringify({ 
      checkout_url: session.url,
      session_id: session.id 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating checkout session");
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
