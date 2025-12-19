import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Crown,
  Check,
  Zap,
  Rocket,
  Shield,
  ArrowRight,
  CreditCard,
  Receipt,
} from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: 19,
    description: "Perfect for getting started",
    features: [
      "2 Projects",
      "100 Subscribers",
      "Basic Analytics",
      "Email Support",
    ],
    popular: false,
  },
  {
    name: "Pro",
    price: 49,
    description: "For growing channels",
    features: [
      "5 Projects",
      "500 Subscribers",
      "Advanced Analytics",
      "Priority Support",
      "Custom Bot Messages",
    ],
    popular: true,
  },
  {
    name: "Premium",
    price: 99,
    description: "For serious creators",
    features: [
      "15 Projects",
      "2,000 Subscribers",
      "Full Analytics Suite",
      "24/7 Support",
      "API Access",
      "White-label Options",
    ],
    popular: false,
  },
  {
    name: "Unlimited",
    price: 199,
    description: "Enterprise scale",
    features: [
      "Unlimited Projects",
      "Unlimited Subscribers",
      "Custom Integrations",
      "Dedicated Account Manager",
      "SLA Guarantee",
      "Custom Development",
    ],
    popular: false,
  },
];

const paymentHistory = [
  { id: 1, date: "Dec 1, 2024", amount: "$49.00", status: "paid", plan: "Pro" },
  { id: 2, date: "Nov 1, 2024", amount: "$49.00", status: "paid", plan: "Pro" },
  { id: 3, date: "Oct 1, 2024", amount: "$19.00", status: "paid", plan: "Starter" },
];

export default function Billing() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and payment methods.
        </p>
      </div>

      {/* Current Plan */}
      <Card variant="glow">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Crown className="h-5 w-5 text-warning" />
                Current Plan
              </CardTitle>
              <CardDescription>Your subscription details</CardDescription>
            </div>
            <Badge variant="success" className="text-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-success mr-1.5 animate-pulse" />
              Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-3xl font-bold text-foreground">Pro Plan</p>
              <p className="text-muted-foreground">$49/month • Renews Jan 1, 2025</p>
            </div>
            <div className="flex gap-2">
              <Button variant="glass">
                <CreditCard className="h-4 w-4 mr-2" />
                Update Payment
              </Button>
              <Button variant="outline">Cancel Plan</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Projects</span>
                <span className="font-medium text-foreground">3 / 5</span>
              </div>
              <Progress value={60} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subscribers</span>
                <span className="font-medium text-foreground">156 / 500</span>
              </div>
              <Progress value={31} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Plans */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              variant={plan.popular ? "glow" : "glass"}
              className={plan.popular ? "relative" : ""}
            >
              {plan.popular && (
                <Badge variant="info" className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
              )}
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-lg">{plan.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-4xl font-bold text-foreground">${plan.price}</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-success flex-shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={plan.popular ? "gradient" : "glass"}
                  className="w-full"
                >
                  {plan.name === "Pro" ? "Current Plan" : "Upgrade"}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Payment History */}
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Payment History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {paymentHistory.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between p-4 rounded-lg bg-muted/30"
              >
                <div>
                  <p className="font-medium text-foreground">{payment.plan} Plan</p>
                  <p className="text-sm text-muted-foreground">{payment.date}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">{payment.amount}</p>
                  <Badge variant="success">Paid</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
