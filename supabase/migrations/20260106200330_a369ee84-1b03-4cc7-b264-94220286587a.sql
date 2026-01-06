-- ============================================
-- PHASE 3: Database-Level Limit Enforcement
-- ============================================

-- Function to check project limits before insert
CREATE OR REPLACE FUNCTION check_project_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count INTEGER;
  max_allowed INTEGER;
  sub_status subscription_status;
  trial_expired BOOLEAN;
BEGIN
  -- Get subscription status and limits
  SELECT 
    cs.status, 
    COALESCE(sp.max_projects, 1),
    (cs.status = 'trial' AND cs.trial_ends_at < NOW())
  INTO sub_status, max_allowed, trial_expired
  FROM client_subscriptions cs
  LEFT JOIN subscription_plans sp ON cs.plan_id = sp.id
  WHERE cs.client_id = NEW.user_id;
  
  -- Check if subscription expired
  IF sub_status = 'expired' OR trial_expired THEN
    RAISE EXCEPTION 'Subscription expired. Please renew to create projects.';
  END IF;
  
  -- Count existing projects
  SELECT COUNT(*) INTO current_count
  FROM projects WHERE user_id = NEW.user_id;
  
  -- Check limit (max_allowed < 0 means unlimited)
  IF max_allowed >= 0 AND current_count >= max_allowed THEN
    RAISE EXCEPTION 'Project limit reached: % of %. Please upgrade your plan.', current_count, max_allowed;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to enforce project limits
DROP TRIGGER IF EXISTS enforce_project_limit ON projects;
CREATE TRIGGER enforce_project_limit
  BEFORE INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION check_project_limit();

-- Function to check subscriber limits before insert
CREATE OR REPLACE FUNCTION check_subscriber_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_owner_id UUID;
  current_count INTEGER;
  max_allowed INTEGER;
  sub_status subscription_status;
  trial_expired BOOLEAN;
BEGIN
  -- Get the project owner
  SELECT user_id INTO project_owner_id
  FROM projects WHERE id = NEW.project_id;
  
  IF project_owner_id IS NULL THEN
    RAISE EXCEPTION 'Project not found';
  END IF;
  
  -- Get subscription status and limits for the project owner
  SELECT 
    cs.status, 
    COALESCE(sp.max_subscribers, 20),
    (cs.status = 'trial' AND cs.trial_ends_at < NOW())
  INTO sub_status, max_allowed, trial_expired
  FROM client_subscriptions cs
  LEFT JOIN subscription_plans sp ON cs.plan_id = sp.id
  WHERE cs.client_id = project_owner_id;
  
  -- Check if subscription expired
  IF sub_status = 'expired' OR trial_expired THEN
    RAISE EXCEPTION 'Subscription expired. Please renew to add subscribers.';
  END IF;
  
  -- Count existing subscribers across all user's projects
  SELECT COUNT(*) INTO current_count
  FROM subscribers s
  JOIN projects p ON s.project_id = p.id
  WHERE p.user_id = project_owner_id;
  
  -- Check limit (max_allowed < 0 means unlimited)
  IF max_allowed >= 0 AND current_count >= max_allowed THEN
    RAISE EXCEPTION 'Subscriber limit reached: % of %. Please upgrade your plan.', current_count, max_allowed;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to enforce subscriber limits
DROP TRIGGER IF EXISTS enforce_subscriber_limit ON subscribers;
CREATE TRIGGER enforce_subscriber_limit
  BEFORE INSERT ON subscribers
  FOR EACH ROW
  EXECUTE FUNCTION check_subscriber_limit();

-- ============================================
-- PHASE 4: Atomic Payment Processing
-- ============================================

-- Atomic function for processing Stripe payments with row locking
CREATE OR REPLACE FUNCTION process_stripe_payment(
  p_subscriber_id UUID,
  p_duration_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscriber RECORD;
  v_start_date TIMESTAMPTZ;
  v_expiry_date TIMESTAMPTZ;
  v_is_extension BOOLEAN := false;
BEGIN
  -- Lock row for update (prevents race condition with concurrent payments)
  SELECT * INTO v_subscriber
  FROM subscribers
  WHERE id = p_subscriber_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscriber not found: %', p_subscriber_id;
  END IF;
  
  -- Calculate dates atomically
  IF v_subscriber.status = 'active' AND v_subscriber.expiry_date > NOW() THEN
    -- EXTENSION: Add duration to existing expiry date
    v_start_date := v_subscriber.start_date;
    v_expiry_date := v_subscriber.expiry_date + (p_duration_days || ' days')::INTERVAL;
    v_is_extension := true;
  ELSE
    -- NEW SUBSCRIPTION or REACTIVATION: Start from now
    v_start_date := NOW();
    v_expiry_date := NOW() + (p_duration_days || ' days')::INTERVAL;
  END IF;
  
  -- Update subscriber atomically
  UPDATE subscribers
  SET 
    status = 'active',
    start_date = v_start_date,
    expiry_date = v_expiry_date,
    payment_method = 'stripe',
    expiry_reminder_sent = false,
    final_reminder_sent = false,
    updated_at = NOW()
  WHERE id = p_subscriber_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'subscriber_id', p_subscriber_id,
    'start_date', v_start_date,
    'expiry_date', v_expiry_date,
    'is_extension', v_is_extension,
    'duration_days', p_duration_days
  );
END;
$$;