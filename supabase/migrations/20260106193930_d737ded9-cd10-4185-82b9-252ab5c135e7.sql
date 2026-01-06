-- CRITICAL FIX: Remove hardcoded admin email from handle_new_user function
-- This prevents privilege escalation via email address spoofing

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );
  
  -- Always assign 'client' role - super_admin must be assigned manually via database
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client'::app_role);
  
  -- Create free trial subscription
  INSERT INTO public.client_subscriptions (client_id, status, trial_ends_at, current_period_start, current_period_end)
  VALUES (
    NEW.id,
    'trial',
    NOW() + INTERVAL '14 days',
    NOW(),
    NOW() + INTERVAL '14 days'
  );
  
  RETURN NEW;
END;
$$;