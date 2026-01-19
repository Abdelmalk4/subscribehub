-- Drop the existing trigger (with correct name) and function with CASCADE
DROP TRIGGER IF EXISTS validate_invoice_trigger ON invoices;
DROP FUNCTION IF EXISTS validate_invoice_amount() CASCADE;

-- Create updated function that allows monthly and yearly billing amounts
CREATE OR REPLACE FUNCTION validate_invoice_amount()
RETURNS TRIGGER AS $$
DECLARE
  plan_price NUMERIC;
  yearly_price NUMERIC;
BEGIN
  -- Only validate if plan_id is provided
  IF NEW.plan_id IS NOT NULL THEN
    SELECT price INTO plan_price FROM subscription_plans WHERE id = NEW.plan_id;
    
    IF plan_price IS NULL THEN
      RAISE EXCEPTION 'Invalid plan_id: Plan not found';
    END IF;
    
    -- Calculate valid yearly price (12 months * 80% discount)
    yearly_price := plan_price * 12 * 0.8;
    
    -- Allow either monthly price or yearly price (with 20% discount)
    IF NEW.amount != plan_price AND NEW.amount != yearly_price THEN
      RAISE EXCEPTION 'Invoice amount (%) does not match plan price (monthly: %, yearly: %)', NEW.amount, plan_price, yearly_price;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate the trigger
CREATE TRIGGER validate_invoice_trigger
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION validate_invoice_amount();