-- Allow users to update their own subscription
CREATE POLICY "Users can update own subscription"
ON public.client_subscriptions
FOR UPDATE
USING (auth.uid() = client_id)
WITH CHECK (auth.uid() = client_id);