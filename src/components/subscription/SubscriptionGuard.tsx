import { useSubscription } from '@/hooks/useSubscription';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Crown, Zap } from 'lucide-react';

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { loading, isExpired, isTrialExpired, canAccessFeatures, daysRemaining } = useSubscription();
  const navigate = useNavigate();

  // Show nothing while loading
  if (loading) {
    return <>{children}</>;
  }

  // Show warning banner if subscription is expiring soon (3 days or less)
  const showExpiryWarning = canAccessFeatures && daysRemaining !== null && daysRemaining <= 3 && daysRemaining > 0;

  // Show modal if expired
  const showExpiredModal = isExpired || isTrialExpired;

  return (
    <>
      {/* Expiry Warning Banner */}
      {showExpiryWarning && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-warning/90 text-warning-foreground px-4 py-2">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">
                Your subscription expires in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}. 
                Upgrade now to keep access.
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate('/billing')}
              className="bg-background/20 hover:bg-background/30"
            >
              <Zap className="h-3 w-3 mr-1" />
              Upgrade
            </Button>
          </div>
        </div>
      )}

      {/* Expired Modal */}
      <Dialog open={showExpiredModal} onOpenChange={() => {}}>
        <DialogContent 
          className="sm:max-w-md" 
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <Crown className="h-8 w-8 text-destructive" />
            </div>
            <DialogTitle className="text-xl">
              {isTrialExpired ? 'Your Free Trial Has Ended' : 'Subscription Expired'}
            </DialogTitle>
            <DialogDescription className="text-center pt-2">
              {isTrialExpired ? (
                <>
                  Your 14-day free trial has ended. Upgrade to a paid plan to continue 
                  managing your projects and subscribers.
                </>
              ) : (
                <>
                  Your subscription has expired. Renew now to regain access to all 
                  features and keep managing your projects.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">What you're missing:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Create and manage Telegram projects</li>
                <li>• Add and track subscribers</li>
                <li>• Automated subscription reminders</li>
                <li>• Payment tracking and analytics</li>
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                variant="gradient"
                size="lg"
                className="w-full"
                onClick={() => navigate('/billing')}
              >
                <Zap className="h-4 w-4 mr-2" />
                View Plans & Upgrade
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => navigate('/billing')}
              >
                Compare all plans
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Content with optional top padding for warning banner */}
      <div className={showExpiryWarning ? 'pt-10' : ''}>
        {children}
      </div>
    </>
  );
}
