import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Rocket, ArrowRight, Sparkles } from "lucide-react";

export default function CTABanner() {
  return (
    <section className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl">
          {/* Background Gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-900/50 via-primary/30 to-purple-900/50" />
          <div className="absolute inset-0 bg-card/30 backdrop-blur-xl" />

          {/* Decorative Elements */}
          <div className="absolute top-0 left-0 w-64 h-64 bg-primary/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-secondary/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

          <div className="relative py-16 px-8 md:px-16 text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2 mb-6">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm text-primary font-medium">Join 500+ successful creators</span>
            </div>

            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4">
              Ready to Monetize Your<br />
              <span className="gradient-text">Telegram Channel?</span>
            </h2>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
              Start your 14-day free trial today. No credit card required.
              Join hundreds of creators already earning with SubscribeHub.
            </p>

            <Link to="/signup">
              <Button size="xl" className="gap-2">
                <Rocket className="h-5 w-5" />
                Start Your Free Trial
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
