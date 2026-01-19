import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How does the free trial work?",
    answer:
      "You get 14 days with all features, 1 project, and 20 subscribers. No credit card required to start. If you decide to continue, simply choose a plan that fits your needs.",
  },
  {
    question: "What payment methods are supported?",
    answer:
      "We support Stripe for automated payments (credit cards, Apple Pay, Google Pay) and manual payment methods with proof verification (bank transfers, crypto, etc.).",
  },
  {
    question: "Can I use my existing Telegram bot?",
    answer:
      "Yes! You can connect your existing Telegram bot by providing the bot token. We'll configure it automatically to work with SubscribeHub.",
  },
  {
    question: "How do I cancel my subscription?",
    answer:
      "You can cancel anytime from your account settings. Your subscription will remain active until the end of the billing period, and you'll retain access to your data.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Absolutely. We use enterprise-grade encryption, secure payment processing through Stripe, and never store sensitive payment information on our servers.",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "Yes, we offer a 30-day money-back guarantee. If you're not satisfied with SubscribeHub, contact our support team for a full refund.",
  },
];

export default function FAQSection() {
  return (
    <section id="faq" className="py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3">
            Frequently Asked <span className="gradient-text">Questions</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Everything you need to know about SubscribeHub.
          </p>
        </div>

        <Accordion type="single" collapsible className="space-y-3">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="bg-card/30 backdrop-blur-xl border border-border/40 rounded-lg px-4 data-[state=open]:border-primary/30 transition-colors"
            >
              <AccordionTrigger className="text-left text-foreground hover:text-primary hover:no-underline py-3 text-sm">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-3 text-xs">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
