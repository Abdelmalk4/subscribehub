import { useEffect } from "react";
import PageTransition from "@/components/PageTransition";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import SocialProofSection from "@/components/landing/SocialProofSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import PricingSection from "@/components/landing/PricingSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import FAQSection from "@/components/landing/FAQSection";
import CTABanner from "@/components/landing/CTABanner";
import Footer from "@/components/landing/Footer";

export default function Landing() {
  // Scroll animation observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" }
    );

    document.querySelectorAll(".fade-in-up").forEach((el) => {
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const handleNavigate = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen overflow-hidden">
        <LandingNavbar onNavigate={handleNavigate} />
        <main>
          <HeroSection />
          <SocialProofSection />
          <FeaturesSection />
          <HowItWorksSection />
          <PricingSection />
          <TestimonialsSection />
          <FAQSection />
          <CTABanner />
        </main>
        <Footer />
      </div>
    </PageTransition>
  );
}
