import { useEffect, useRef } from "react";
import { Bot, Settings, DollarSign } from "lucide-react";

const steps = [
  {
    icon: Bot,
    number: "1",
    title: "Connect Your Bot",
    description: "Link your Telegram bot in just 2 minutes. No coding required.",
  },
  {
    icon: Settings,
    number: "2",
    title: "Create Plans",
    description: "Set up subscription plans with custom pricing and durations.",
  },
  {
    icon: DollarSign,
    number: "3",
    title: "Start Earning",
    description: "Share your bot link and collect payments automatically.",
  },
];

export default function HowItWorksSection() {
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
      { threshold: 0.2 }
    );

    const section = sectionRef.current;
    if (section) observer.observe(section);

    return () => {
      if (section) observer.unobserve(section);
    };
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-4 sm:px-6 lg:px-8 fade-in-up">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
            How It <span className="gradient-text">Works</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Get started in minutes, not hours.
          </p>
        </div>

        <div className="relative">
          {/* Connecting Line */}
          <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/50 via-secondary/50 to-primary/50 -translate-y-1/2 z-0" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
            {steps.map((step, index) => (
              <div key={step.number} className="flex flex-col items-center text-center group">
                {/* Step Number */}
                <div className="relative mb-6">
                  <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <span className="text-3xl font-bold text-primary-foreground">{step.number}</span>
                  </div>
                  <div className="absolute -bottom-2 -right-2 h-10 w-10 rounded-xl bg-card border border-border flex items-center justify-center group-hover:border-primary/50 transition-colors">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>

                <h3 className="text-xl font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground max-w-xs">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
