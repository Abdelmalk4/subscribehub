import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, CreditCard, Shield, BarChart3, Clock, Zap } from "lucide-react";

const features = [
  {
    icon: Bot,
    title: "Automated Bot",
    description: "Self-service subscription management. Your bot handles everything 24/7.",
    span: 1,
  },
  {
    icon: CreditCard,
    title: "Dual Payment Processing",
    description: "Accept Stripe payments and manual transfers with payment proof verification.",
    span: 1,
  },
  {
    icon: Shield,
    title: "Secure Access Control",
    description: "One-time invite links that expire. Complete control over channel access.",
    span: 1,
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    description: "Track revenue, subscriber growth, retention rates, and identify trends with beautiful dashboards.",
    span: 2,
  },
  {
    icon: Clock,
    title: "Auto Expiry Management",
    description: "Smart reminders at 3-day and 1-day marks. Automatic expiry and removal.",
    span: 1,
  },
];

export default function FeaturesSection() {
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

    const cards = sectionRef.current?.querySelectorAll(".feature-card");
    cards?.forEach((card) => observer.observe(card));

    return () => {
      cards?.forEach((card) => observer.unobserve(card));
    };
  }, []);

  return (
    <section id="features" ref={sectionRef} className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4">
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Features
          </Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
            Everything You Need to <span className="gradient-text">Scale</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A complete toolkit for content creators who want to monetize their Telegram presence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card
              key={feature.title}
              className={`feature-card fade-in-up group hover:border-primary/30 transition-all duration-300 hover:shadow-md ${
                feature.span === 2 ? "md:col-span-2" : ""
              }`}
              style={{ transitionDelay: `${index * 100}ms` }}
            >
              <CardContent className="pt-6 pb-6">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-all duration-300">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
