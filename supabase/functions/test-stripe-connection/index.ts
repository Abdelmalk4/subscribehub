import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestStripeRequest {
  secret_key: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { secret_key }: TestStripeRequest = await req.json();

    if (!secret_key) {
      return new Response(JSON.stringify({ valid: false, error: "Secret key is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate key format
    if (!secret_key.startsWith("sk_live_") && !secret_key.startsWith("sk_test_")) {
      return new Response(JSON.stringify({ 
        valid: false, 
        error: "Invalid key format. Key should start with 'sk_live_' or 'sk_test_'" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Test the key by fetching account info
    const response = await fetch("https://api.stripe.com/v1/account", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${secret_key}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Stripe API error:", errorData);
      return new Response(JSON.stringify({ 
        valid: false, 
        error: errorData.error?.message || "Invalid API key" 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const account = await response.json();
    console.log("Stripe account validated:", account.id);

    return new Response(JSON.stringify({ 
      valid: true, 
      account_name: account.business_profile?.name || account.settings?.dashboard?.display_name || account.email || "Stripe Account",
      account_id: account.id,
      livemode: account.charges_enabled && !secret_key.startsWith("sk_test_"),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error testing Stripe connection:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ valid: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
