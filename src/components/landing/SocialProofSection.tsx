import { useEffect, useRef } from "react";

const logos = [
  { name: "TechCrunch", text: "TechCrunch" },
  { name: "Forbes", text: "Forbes" },
  { name: "Bloomberg", text: "Bloomberg" },
  { name: "Reuters", text: "Reuters" },
  { name: "ProductHunt", text: "Product Hunt" },
];

export default function SocialProofSection() {
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

    const section = sectionRef.current;
    if (section) {
      observer.observe(section);
    }

    return () => {
      if (section) observer.unobserve(section);
    };
  }, []);

  return (
    <section ref={sectionRef} className="py-16 px-4 sm:px-6 lg:px-8 fade-in-up">
      <div className="max-w-5xl mx-auto text-center">
        <p className="text-muted-foreground text-sm uppercase tracking-widest mb-8">
          Trusted by 500+ creators worldwide
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
          {logos.map((logo) => (
            <div
              key={logo.name}
              className="logo-grayscale text-2xl font-bold text-muted-foreground/70 hover:text-foreground transition-all cursor-default"
            >
              {logo.text}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
