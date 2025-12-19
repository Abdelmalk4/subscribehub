-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'client');

-- Create subscription_status enum
CREATE TYPE public.subscription_status AS ENUM ('trial', 'active', 'pending_payment', 'expired');

-- Create subscriber_status enum  
CREATE TYPE public.subscriber_status AS ENUM ('active', 'pending_payment', 'pending_approval', 'awaiting_proof', 'expired', 'rejected');

-- User Roles Table (security critical - separate from profiles)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'client',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Profiles Table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Platform Subscription Plans (SaaS tiers)
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name TEXT NOT NULL,
  plan_slug TEXT UNIQUE NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_cycle TEXT DEFAULT 'monthly',
  max_projects INTEGER NOT NULL DEFAULT 1,
  max_subscribers INTEGER NOT NULL DEFAULT 20,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Client Subscriptions (to platform)
CREATE TABLE public.client_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan_id UUID REFERENCES subscription_plans(id),
  status subscription_status DEFAULT 'trial',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;

-- Projects Table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_name TEXT NOT NULL,
  bot_token TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  admin_telegram_id BIGINT,
  admin_username TEXT,
  support_contact TEXT,
  stripe_config JSONB DEFAULT '{"enabled": false}',
  manual_payment_config JSONB DEFAULT '{"enabled": true, "instructions": ""}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Subscription Plans (per project)
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  plan_name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  duration_days INTEGER NOT NULL,
  description TEXT,
  stripe_price_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Subscribers Table
CREATE TABLE public.subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  telegram_user_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT,
  status subscriber_status NOT NULL DEFAULT 'pending_payment',
  plan_id UUID REFERENCES plans(id),
  payment_method TEXT,
  payment_proof_url TEXT,
  invite_link TEXT,
  start_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  expiry_reminder_sent BOOLEAN DEFAULT false,
  final_reminder_sent BOOLEAN DEFAULT false,
  approved_by_admin_id UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, telegram_user_id)
);

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

-- Client Subscription Payments
CREATE TABLE public.client_subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES auth.users(id) NOT NULL,
  subscription_id UUID REFERENCES client_subscriptions(id),
  plan_id UUID REFERENCES subscription_plans(id),
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT,
  payment_proof_url TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.client_subscription_payments ENABLE ROW LEVEL SECURITY;

-- Platform Configuration
CREATE TABLE public.platform_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

-- ============= HELPER FUNCTION =============
-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============= ROW LEVEL SECURITY POLICIES =============

-- User Roles Policies
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'));

-- Profiles Policies
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admins can view all profiles"
ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'));

-- Subscription Plans (public read, admin write)
CREATE POLICY "Anyone can view active subscription plans"
ON public.subscription_plans FOR SELECT
USING (is_active = true);

CREATE POLICY "Super admins can manage subscription plans"
ON public.subscription_plans FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'));

-- Client Subscriptions Policies
CREATE POLICY "Users can view own subscription"
ON public.client_subscriptions FOR SELECT
USING (auth.uid() = client_id);

CREATE POLICY "Users can insert own subscription"
ON public.client_subscriptions FOR INSERT
WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Super admins can manage all subscriptions"
ON public.client_subscriptions FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'));

-- Projects Policies
CREATE POLICY "Users can view own projects"
ON public.projects FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
ON public.projects FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
ON public.projects FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
ON public.projects FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all projects"
ON public.projects FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'));

-- Plans Policies
CREATE POLICY "Project owners can manage plans"
ON public.plans FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = plans.project_id
    AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Super admins can view all plans"
ON public.plans FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'));

-- Subscribers Policies
CREATE POLICY "Project owners can manage subscribers"
ON public.subscribers FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects
    WHERE projects.id = subscribers.project_id
    AND projects.user_id = auth.uid()
  )
);

CREATE POLICY "Super admins can view all subscribers"
ON public.subscribers FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'));

-- Client Subscription Payments Policies
CREATE POLICY "Users can view own payments"
ON public.client_subscription_payments FOR SELECT
USING (auth.uid() = client_id);

CREATE POLICY "Users can insert own payments"
ON public.client_subscription_payments FOR INSERT
WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Super admins can manage all payments"
ON public.client_subscription_payments FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'));

-- Platform Config Policies (super admin only)
CREATE POLICY "Super admins can manage platform config"
ON public.platform_config FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'));

-- ============= TRIGGERS =============

-- Auto-create profile and role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
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
  
  -- Assign role (super_admin for specific email, client for everyone else)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE 
      WHEN NEW.email = 'admin@subscribehub.com' THEN 'super_admin'::app_role
      ELSE 'client'::app_role
    END
  );
  
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscribers_updated_at
  BEFORE UPDATE ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();