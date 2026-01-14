import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This function handles the OAuth callback redirect from Stripe
// It's a GET endpoint that Stripe redirects to after user authorizes

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stripePlatformSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

// Frontend URL to redirect back to after OAuth
const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://subscribehub.lovable.app";

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  console.log("Stripe Connect callback received", { hasCode: !!code, hasState: !!state, error });

  // Handle user declining or errors
  if (error) {
    console.error("Stripe Connect OAuth error:", error, errorDescription);
    const redirectUrl = new URL(`${frontendUrl}/projects`);
    redirectUrl.searchParams.set("stripe_error", errorDescription || error);
    return Response.redirect(redirectUrl.toString(), 302);
  }

  if (!code || !state) {
    console.error("Missing code or state in callback");
    const redirectUrl = new URL(`${frontendUrl}/projects`);
    redirectUrl.searchParams.set("stripe_error", "Missing authorization parameters");
    return Response.redirect(redirectUrl.toString(), 302);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse state to get project_id and user_id
    let stateData: { project_id: string; user_id: string };
    try {
      stateData = JSON.parse(state);
    } catch {
      throw new Error("Invalid state parameter");
    }

    const { project_id, user_id } = stateData;
    console.log("Processing OAuth for project:", project_id);

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
    console.log("OAuth token exchange:", { 
      success: !tokenData.error,
      stripe_user_id: tokenData.stripe_user_id 
    });

    if (tokenData.error) {
      console.error("OAuth token exchange error:", tokenData.error_description);
      const redirectUrl = new URL(`${frontendUrl}/projects`);
      redirectUrl.searchParams.set("stripe_error", tokenData.error_description || "Failed to connect");
      return Response.redirect(redirectUrl.toString(), 302);
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

    // Verify project exists and belongs to user
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, user_id")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      console.error("Project not found:", projectError);
      const redirectUrl = new URL(`${frontendUrl}/projects`);
      redirectUrl.searchParams.set("stripe_error", "Project not found");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    if (project.user_id !== user_id) {
      console.error("User mismatch for project");
      const redirectUrl = new URL(`${frontendUrl}/projects`);
      redirectUrl.searchParams.set("stripe_error", "Unauthorized");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // Update project with connected account info
    const stripeConfig = {
      connected: true,
      stripe_account_id: tokenData.stripe_user_id,
      account_name: accountName,
      livemode: tokenData.livemode,
      enabled: true,
    };

    const { error: updateError } = await supabase
      .from("projects")
      .update({ stripe_config: stripeConfig })
      .eq("id", project_id);

    if (updateError) {
      console.error("Failed to update project:", updateError);
      const redirectUrl = new URL(`${frontendUrl}/projects`);
      redirectUrl.searchParams.set("stripe_error", "Failed to save connection");
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // Log audit event
    await supabase.rpc("log_audit_event", {
      p_user_id: user_id,
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

    // Redirect back to projects page with success
    const redirectUrl = new URL(`${frontendUrl}/projects`);
    redirectUrl.searchParams.set("stripe_connected", "true");
    redirectUrl.searchParams.set("account_name", accountName);
    return Response.redirect(redirectUrl.toString(), 302);

  } catch (err) {
    console.error("Stripe Connect callback error:", err);
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const redirectUrl = new URL(`${frontendUrl}/projects`);
    redirectUrl.searchParams.set("stripe_error", errorMessage);
    return Response.redirect(redirectUrl.toString(), 302);
  }
});
