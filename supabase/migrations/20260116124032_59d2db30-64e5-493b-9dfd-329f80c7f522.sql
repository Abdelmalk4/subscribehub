-- Phase 1.2: Prevent Client Self-Reactivation
-- Create trigger to prevent clients from changing their subscription status from 'expired' to 'active' without admin approval

CREATE OR REPLACE FUNCTION prevent_self_reactivation()
RETURNS TRIGGER AS $$
BEGIN
  -- Only apply this check when status is changing from 'expired' to 'active'
  IF OLD.status = 'expired' AND NEW.status = 'active' THEN
    -- Check if the current user is a super_admin
    IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
      RAISE EXCEPTION 'Cannot self-reactivate subscription. Please contact support to renew your subscription.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger on client_subscriptions table
DROP TRIGGER IF EXISTS prevent_self_reactivation_trigger ON client_subscriptions;

CREATE TRIGGER prevent_self_reactivation_trigger
BEFORE UPDATE ON client_subscriptions
FOR EACH ROW EXECUTE FUNCTION prevent_self_reactivation();