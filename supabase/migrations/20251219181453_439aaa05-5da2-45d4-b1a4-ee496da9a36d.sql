
-- Create table for sales inquiries
CREATE TABLE public.sales_inquiries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  message TEXT,
  plan_interest TEXT DEFAULT 'unlimited',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.sales_inquiries ENABLE ROW LEVEL SECURITY;

-- Users can insert their own inquiries
CREATE POLICY "Users can insert inquiries"
ON public.sales_inquiries
FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Users can view their own inquiries
CREATE POLICY "Users can view own inquiries"
ON public.sales_inquiries
FOR SELECT
USING (auth.uid() = user_id);

-- Super admins can manage all inquiries
CREATE POLICY "Super admins can manage all inquiries"
ON public.sales_inquiries
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
