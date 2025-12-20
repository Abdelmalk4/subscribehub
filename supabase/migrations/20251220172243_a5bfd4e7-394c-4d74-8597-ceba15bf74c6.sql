-- Create platform payment methods table for bank/crypto/binance details
CREATE TABLE public.platform_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_type TEXT NOT NULL CHECK (method_type IN ('bank_transfer', 'binance', 'crypto')),
  method_name TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_payment_methods ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage payment methods
CREATE POLICY "Super admins can manage payment methods"
ON public.platform_payment_methods
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Anyone can view active payment methods (for bot display)
CREATE POLICY "Anyone can view active payment methods"
ON public.platform_payment_methods
FOR SELECT
USING (is_active = true);

-- Add 'suspended' to subscriber_status enum
ALTER TYPE public.subscriber_status ADD VALUE IF NOT EXISTS 'suspended';

-- Create trigger for updated_at
CREATE TRIGGER update_platform_payment_methods_updated_at
  BEFORE UPDATE ON public.platform_payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add rejection_reason and suspended_at columns to subscribers
ALTER TABLE public.subscribers 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_by UUID;