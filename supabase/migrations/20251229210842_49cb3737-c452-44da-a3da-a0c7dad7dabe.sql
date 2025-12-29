-- Create extend_requests table for tracking subscription extension requests
CREATE TABLE public.extend_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscriber_id UUID NOT NULL REFERENCES public.subscribers(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_days INTEGER NOT NULL DEFAULT 30,
  payment_method TEXT,
  payment_proof_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID
);

-- Enable RLS
ALTER TABLE public.extend_requests ENABLE ROW LEVEL SECURITY;

-- Project owners can manage extend requests for their projects
CREATE POLICY "Project owners can manage extend requests"
ON public.extend_requests
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = extend_requests.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Super admins can view all extend requests
CREATE POLICY "Super admins can view all extend requests"
ON public.extend_requests
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_extend_requests_project_id ON public.extend_requests(project_id);
CREATE INDEX idx_extend_requests_subscriber_id ON public.extend_requests(subscriber_id);
CREATE INDEX idx_extend_requests_status ON public.extend_requests(status);