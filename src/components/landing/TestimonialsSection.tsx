import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Star, Quote } from "lucide-react";

const testimonials = [
  {
    quote:
      "SubscribeHub saved me 10+ hours per week on subscriber management. My revenue is up 40% since I started using it!",
    author: "@TraderMike",
    role: "Crypto Signals Channel",
    rating: 5,
  },
  {
    quote:
      "The automated bot handles everything. I just create content and the money comes in. Best investment I've made.",
    author: "@ContentQueen",
    role: "Lifestyle & Coaching",
    rating: 5,
  },
  {
    quote:
      "Finally, a platform that understands Telegram creators. The analytics alone are worth the subscription.",
    author: "@DataDriven",
    role: "Stock Market Analysis",
    rating: 5,
  },
  {
    quote:
      "Switched from manual management and never looked back. Customer support is incredible too!",
    author: "@FitnessGuru",
    role: "Fitness Programs Channel",
    rating: 5,
  },
];

export default function TestimonialsSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const handlePrev = () => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  const handleNext = () => {
    setIsAutoPlaying(false);
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3">
            Loved by <span className="gradient-text">Creators</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            See what our users have to say about SubscribeHub.
          </p>
        </div>

        <div className="relative">
          <Card className="overflow-hidden">
            <CardContent className="p-6 md:p-8 text-center relative">
              <Quote className="absolute top-4 left-4 h-8 w-8 text-primary/20" />
              
              <div className="mb-4 flex items-center justify-center gap-0.5">
                {[...Array(testimonials[currentIndex].rating)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 text-warning fill-warning" />
                ))}
              </div>

              <blockquote className="text-base md:text-lg text-foreground mb-6 leading-relaxed">
                "{testimonials[currentIndex].quote}"
              </blockquote>

              <div>
                <p className="text-sm font-semibold text-foreground">{testimonials[currentIndex].author}</p>
                <p className="text-xs text-muted-foreground">{testimonials[currentIndex].role}</p>
              </div>
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <Button variant="ghost" size="icon-sm" onClick={handlePrev} className="rounded-full">
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-1.5">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setIsAutoPlaying(false);
                    setCurrentIndex(index);
                  }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === currentIndex
                      ? "w-6 bg-primary"
                      : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                />
              ))}
            </div>

            <Button variant="ghost" size="icon-sm" onClick={handleNext} className="rounded-full">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
