-- Phase 2.1: Server-Side Invoice Validation
-- Create trigger to validate invoice amounts match plan prices

CREATE OR REPLACE FUNCTION validate_invoice_amount()
RETURNS TRIGGER AS $$
DECLARE
  plan_price NUMERIC;
BEGIN
  -- Only validate if plan_id is provided
  IF NEW.plan_id IS NOT NULL THEN
    SELECT price INTO plan_price FROM subscription_plans WHERE id = NEW.plan_id;
    
    IF plan_price IS NULL THEN
      RAISE EXCEPTION 'Invalid plan_id: Plan not found';
    END IF;
    
    IF NEW.amount != plan_price THEN
      RAISE EXCEPTION 'Invoice amount (%) does not match plan price (%)', NEW.amount, plan_price;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger on invoices table
DROP TRIGGER IF EXISTS validate_invoice_trigger ON invoices;

CREATE TRIGGER validate_invoice_trigger
BEFORE INSERT ON invoices
FOR EACH ROW EXECUTE FUNCTION validate_invoice_amount();

-- Phase 2.2: Create notification tracking for payment proof submissions
-- Add a table to track admin notifications for payment proofs

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Project owners can view their notifications
CREATE POLICY "Project owners can view their notifications"
  ON admin_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = admin_notifications.project_id 
      AND projects.user_id = auth.uid()
    )
  );

-- Policy: Project owners can update their notifications (mark as read)
CREATE POLICY "Project owners can update their notifications"
  ON admin_notifications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = admin_notifications.project_id 
      AND projects.user_id = auth.uid()
    )
  );

-- Policy: System can insert notifications (via service role)
CREATE POLICY "System can insert notifications"
  ON admin_notifications FOR INSERT
  WITH CHECK (true);

-- Enable realtime for admin notifications
ALTER PUBLICATION supabase_realtime ADD TABLE admin_notifications;