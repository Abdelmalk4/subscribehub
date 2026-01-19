import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Check, Star, ArrowRight } from "lucide-react";

const plans = [
  {
    name: "Starter",
    monthlyPrice: 20,
    yearlyPrice: 192,
    description: "Perfect for getting started",
    features: ["1 project", "50 subscribers", "Basic analytics", "Email support"],
    popular: false,
  },
  {
    name: "Pro",
    monthlyPrice: 50,
    yearlyPrice: 480,
    description: "For growing creators",
    features: [
      "3 projects",
      "300 subscribers",
      "Advanced analytics",
      "Priority support",
      "Custom branding",
    ],
    popular: true,
  },
  {
    name: "Premium",
    monthlyPrice: 120,
    yearlyPrice: 1152,
    description: "For power users",
    features: [
      "5 projects",
      "1,000 subscribers",
      "Real-time analytics",
      "Dedicated support",
      "API access",
      "White-label",
    ],
    popular: false,
  },
  {
    name: "Unlimited",
    monthlyPrice: null,
    yearlyPrice: null,
    description: "For enterprises",
    features: [
      "Unlimited projects",
      "Unlimited subscribers",
      "Everything in Premium",
      "Custom integrations",
      "SLA guarantee",
    ],
    popular: false,
  },
];

export default function PricingSection() {
  const [isYearly, setIsYearly] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1 }
    );

    const cards = sectionRef.current?.querySelectorAll(".pricing-card");
    cards?.forEach((card) => observer.observe(card));

    return () => {
      cards?.forEach((card) => observer.unobserve(card));
    };
  }, []);

  return (
    <section id="pricing" ref={sectionRef} className="py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3">
            Simple, Transparent <span className="gradient-text">Pricing</span>
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto mb-6">
            Choose the perfect plan for your needs. All plans include a 14-day free trial.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3">
            <span className={`text-xs ${!isYearly ? "text-foreground" : "text-muted-foreground"}`}>
              Monthly
            </span>
            <Switch checked={isYearly} onCheckedChange={setIsYearly} />
            <span className={`text-xs ${isYearly ? "text-foreground" : "text-muted-foreground"}`}>
              Yearly
            </span>
            {isYearly && (
              <Badge variant="glass-primary" className="ml-1 text-[10px]">
                Save 20%
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan, index) => (
            <Card
              key={plan.name}
              className={`pricing-card fade-in-up relative overflow-hidden transition-all duration-300 hover:scale-[1.02] ${
                plan.popular
                  ? "bg-gradient-to-b from-primary/10 to-secondary/10 border-primary/50 shadow-glow-md scale-105"
                  : "bg-card/30 backdrop-blur-xl border-border/40 hover:border-primary/30"
              }`}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              {plan.popular && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-secondary" />
              )}

              <CardHeader className="pb-3">
                {plan.popular && (
                  <Badge className="w-fit mb-1.5 bg-primary/20 text-primary border-primary/30 text-[10px]">
                    <Star className="h-2.5 w-2.5 mr-0.5 fill-primary" />
                    Most Popular
                  </Badge>
                )}
                <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
                <p className="text-xs text-muted-foreground">{plan.description}</p>
              </CardHeader>

              <CardContent>
                <div className="mb-4">
                  {plan.monthlyPrice !== null ? (
                    <>
                      <span className="text-2xl font-bold text-foreground">
                        ${isYearly ? Math.round(plan.yearlyPrice! / 12) : plan.monthlyPrice}
                      </span>
                      <span className="text-xs text-muted-foreground">/month</span>
                      {isYearly && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          ${plan.yearlyPrice}/year billed annually
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-xl font-bold text-foreground">Contact Us</span>
                  )}
                </div>

                <ul className="space-y-2 mb-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Check className="h-3 w-3 text-success shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link to={plan.monthlyPrice !== null ? "/signup" : "/contact"}>
                  <Button
                    variant={plan.popular ? "gradient" : "glass"}
                    size="sm"
                    className={`w-full gap-1.5 ${plan.popular ? "btn-glow" : ""}`}
                  >
                    {plan.monthlyPrice !== null ? "Start Free Trial" : "Talk to Sales"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
