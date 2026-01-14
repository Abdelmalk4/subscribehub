import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stripePlatformSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

interface OAuthRequest {
  action: "get_connect_url" | "handle_callback";
  project_id: string;
  code?: string; // For callback
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify JWT and get user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, project_id, code }: OAuthRequest = await req.json();
    console.log(`Stripe Connect OAuth action: ${action} for project: ${project_id}`);

    // Verify project ownership
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (projectError || !project) {
      console.error("Project not found or unauthorized:", projectError);
      return new Response(JSON.stringify({ error: "Project not found or unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_connect_url") {
      // Generate Stripe Connect OAuth URL
      // Using Express accounts for simplest onboarding
      const redirectUri = `${supabaseUrl}/functions/v1/stripe-connect-callback`;
      
      const params = new URLSearchParams({
        response_type: "code",
        client_id: await getStripeClientId(),
        scope: "read_write",
        redirect_uri: redirectUri,
        state: JSON.stringify({ project_id, user_id: user.id }),
        "stripe_user[business_type]": "individual",
      });

      const connectUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
      
      console.log("Generated Connect URL for project:", project_id);

      return new Response(JSON.stringify({ connect_url: connectUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "handle_callback") {
      if (!code) {
        return new Response(JSON.stringify({ error: "Missing authorization code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Exchange code for access token and connected account ID
      const tokenResponse = await fetch("https://connect.stripe.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          client_secret: stripePlatformSecretKey,
        }).toString(),
      });

      const tokenData = await tokenResponse.json();
      console.log("OAuth token exchange result:", JSON.stringify({ 
        success: !tokenData.error,
        stripe_user_id: tokenData.stripe_user_id 
      }));

      if (tokenData.error) {
        console.error("OAuth token exchange error:", tokenData.error_description);
        return new Response(JSON.stringify({ 
          error: "Failed to connect Stripe account", 
          details: tokenData.error_description 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get account details for display
      const accountResponse = await fetch(`https://api.stripe.com/v1/accounts/${tokenData.stripe_user_id}`, {
        headers: {
          "Authorization": `Bearer ${stripePlatformSecretKey}`,
        },
      });
      const accountData = await accountResponse.json();
      const accountName = accountData.business_profile?.name || 
                          accountData.settings?.dashboard?.display_name || 
                          accountData.email || 
                          "Connected Account";

      // Update project with connected account info
      const stripeConfig = {
        connected: true,
        stripe_account_id: tokenData.stripe_user_id,
        account_name: accountName,
        livemode: tokenData.livemode,
        enabled: true,
        // Remove old key-based fields
        public_key: null,
        secret_key: null,
        webhook_secret: null,
      };

      const { error: updateError } = await supabase
        .from("projects")
        .update({ stripe_config: stripeConfig })
        .eq("id", project_id);

      if (updateError) {
        console.error("Failed to update project with Stripe Connect:", updateError);
        return new Response(JSON.stringify({ error: "Failed to save connection" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log audit event
      await supabase.rpc("log_audit_event", {
        p_user_id: user.id,
        p_action: "stripe_connect_linked",
        p_resource_type: "project",
        p_resource_id: project_id,
        p_changes: {
          stripe_account_id: tokenData.stripe_user_id,
          account_name: accountName,
          livemode: tokenData.livemode,
        },
      });

      console.log("Successfully connected Stripe account:", tokenData.stripe_user_id);

      return new Response(JSON.stringify({ 
        success: true,
        account_name: accountName,
        livemode: tokenData.livemode,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Stripe Connect OAuth error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Get Stripe Connect client ID from the platform account
async function getStripeClientId(): Promise<string> {
  const response = await fetch("https://api.stripe.com/v1/account", {
    headers: {
      "Authorization": `Bearer ${stripePlatformSecretKey}`,
    },
  });
  const account = await response.json();
  // For Connect, the client_id is found in the Stripe Dashboard settings
  // We'll use a fallback approach: check env var first, then use account id
  const clientId = Deno.env.get("STRIPE_CONNECT_CLIENT_ID");
  if (clientId) return clientId;
  
  // If no client ID is configured, throw helpful error
  throw new Error("STRIPE_CONNECT_CLIENT_ID not configured. Please add it in Stripe Dashboard → Connect → Settings");
}
