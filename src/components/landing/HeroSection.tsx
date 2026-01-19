import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Rocket, ArrowRight, Play, Check, BarChart3, Users, CreditCard, Bell } from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative pt-28 md:pt-36 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 -left-40 w-80 h-80 bg-primary/20 rounded-full blur-3xl animate-float" />
        <div
          className="absolute top-60 -right-40 w-96 h-96 bg-secondary/15 rounded-full blur-3xl animate-float"
          style={{ animationDelay: "2s" }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-radial from-primary/10 to-transparent rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center max-w-4xl mx-auto mb-16">
          <Badge variant="glass-primary" className="mb-6 px-4 py-2 text-sm">
            <Rocket className="h-4 w-4 mr-2" />
            The #1 Telegram Monetization Platform
          </Badge>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight mb-6">
            Monetize Your Telegram Channels
            <br />
            <span className="gradient-text">— Effortlessly</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            The all-in-one platform to manage subscribers, process payments, and grow your community.
            Automate everything while you focus on creating content.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link to="/signup">
              <Button size="xl" className="gap-2 min-w-[220px]">
                <Rocket className="h-5 w-5" />
                Start Free Trial
              </Button>
            </Link>
            <Button variant="secondary" size="xl" className="min-w-[200px] gap-2">
              <Play className="h-5 w-5" />
              Watch Demo
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              No credit card required
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              14-day free trial
            </span>
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              Cancel anytime
            </span>
          </div>
        </div>

        {/* Dashboard Preview */}
        <div className="relative max-w-5xl mx-auto">
          <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-secondary/20 to-primary/20 rounded-3xl blur-2xl opacity-50" />
          <div className="relative glass-card rounded-2xl p-4 sm:p-6 animate-float-slow">
            <div className="bg-card/80 rounded-xl p-4 sm:p-6 border border-border/40">
              {/* Mock Dashboard Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                    <Rocket className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Crypto Signals Pro</p>
                    <p className="text-xs text-muted-foreground">Premium Channel</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-success/20 text-success border-success/30">
                  Live
                </Badge>
              </div>

              {/* Mock Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { icon: Users, label: "Subscribers", value: "1,234", change: "+12%" },
                  { icon: CreditCard, label: "Revenue", value: "$8,456", change: "+23%" },
                  { icon: BarChart3, label: "Growth", value: "18%", change: "+5%" },
                  { icon: Bell, label: "Renewals", value: "89%", change: "+3%" },
                ].map((stat) => (
                  <div key={stat.label} className="glass-panel rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <stat.icon className="h-4 w-4 text-primary" />
                      <span className="text-xs text-muted-foreground">{stat.label}</span>
                    </div>
                    <p className="text-xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-success">{stat.change}</p>
                  </div>
                ))}
              </div>

              {/* Mock Chart */}
              <div className="h-32 sm:h-40 bg-card/50 rounded-lg border border-border/30 flex items-end justify-around p-4 gap-2">
                {[40, 65, 45, 80, 55, 90, 75, 85, 60, 95, 70, 88].map((height, i) => (
                  <div
                    key={i}
                    className="w-full bg-gradient-to-t from-primary/80 to-primary/40 rounded-t"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
