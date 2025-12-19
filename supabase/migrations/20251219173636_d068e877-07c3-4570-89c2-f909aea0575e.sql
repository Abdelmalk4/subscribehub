-- Insert default subscription plans
INSERT INTO public.subscription_plans (plan_name, plan_slug, price, max_projects, max_subscribers, billing_cycle, is_active, features)
VALUES 
  ('Starter', 'starter', 19, 2, 100, 'monthly', true, '["2 Projects", "100 Subscribers", "Basic Analytics", "Email Support"]'::jsonb),
  ('Pro', 'pro', 49, 5, 500, 'monthly', true, '["5 Projects", "500 Subscribers", "Advanced Analytics", "Priority Support", "Custom Bot Messages"]'::jsonb),
  ('Premium', 'premium', 99, 15, 2000, 'monthly', true, '["15 Projects", "2,000 Subscribers", "Full Analytics Suite", "24/7 Support", "API Access", "White-label Options"]'::jsonb),
  ('Unlimited', 'unlimited', 199, 999999, 999999, 'monthly', true, '["Unlimited Projects", "Unlimited Subscribers", "Custom Integrations", "Dedicated Account Manager", "SLA Guarantee", "Custom Development"]'::jsonb)
ON CONFLICT DO NOTHING;