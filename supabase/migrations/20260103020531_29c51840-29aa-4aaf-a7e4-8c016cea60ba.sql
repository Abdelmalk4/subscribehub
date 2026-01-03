-- Create client_payment_methods table (for clients to receive payments from subscribers)
CREATE TABLE public.client_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  method_type text NOT NULL CHECK (method_type IN ('bank_transfer', 'binance', 'crypto')),
  method_name text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  instructions text,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create invoices table for tracking client subscription payments
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  client_id uuid NOT NULL,
  subscription_id uuid REFERENCES client_subscriptions(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected', 'cancelled')),
  payment_method text,
  payment_proof_url text,
  notes text,
  admin_notes text,
  due_date timestamptz,
  paid_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_payment_methods
CREATE POLICY "Users can manage own payment methods"
ON public.client_payment_methods
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admins can view all client payment methods"
ON public.client_payment_methods
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- RLS policies for invoices
CREATE POLICY "Users can view own invoices"
ON public.invoices
FOR SELECT
USING (auth.uid() = client_id);

CREATE POLICY "Users can insert own invoices"
ON public.invoices
FOR INSERT
WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Users can update own pending invoices"
ON public.invoices
FOR UPDATE
USING (auth.uid() = client_id AND status = 'pending')
WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Super admins can manage all invoices"
ON public.invoices
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Create trigger for updated_at on client_payment_methods
CREATE TRIGGER update_client_payment_methods_updated_at
BEFORE UPDATE ON public.client_payment_methods
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create sequence for invoice numbers
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1000;

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(nextval('invoice_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger to auto-generate invoice number
CREATE TRIGGER set_invoice_number
BEFORE INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION generate_invoice_number();