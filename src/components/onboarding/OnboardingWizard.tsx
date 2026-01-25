import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { WelcomeStep } from "./steps/WelcomeStep";
import { ProjectStep } from "./steps/ProjectStep";
import { BotStep } from "./steps/BotStep";
import { PlanStep } from "./steps/PlanStep";
import { SuccessStep } from "./steps/SuccessStep";

export interface OnboardingData {
  projectName: string;
  supportContact: string;
  botToken: string;
  channelId: string;
  botUsername: string;
  channelTitle: string;
  planName: string;
  price: number;
  durationDays: number;
}

const STORAGE_KEY = "subscribehub_onboarding";

export function OnboardingWizard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [data, setData] = useState<OnboardingData>({
    projectName: "",
    supportContact: "",
    botToken: "",
    channelId: "",
    botUsername: "",
    channelTitle: "",
    planName: "Monthly",
    price: 29,
    durationDays: 30,
  });

  // Load saved progress from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setData((prev) => ({ ...prev, ...parsed.data }));
        setCurrentStep(parsed.step || 0);
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save progress to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, step: currentStep }));
    } catch {
      // Ignore storage errors
    }
  }, [data, currentStep]);

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    setCurrentStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleComplete = async () => {
    if (!user) return;
    
    setIsSubmitting(true);

    try {
      // 1. Create the project
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          project_name: data.projectName,
          bot_token: data.botToken,
          channel_id: data.channelId,
          support_contact: data.supportContact || null,
          admin_username: data.botUsername,
          status: "active",
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // 2. Create the first plan
      const { error: planError } = await supabase.from("plans").insert({
        project_id: project.id,
        plan_name: data.planName,
        price: data.price,
        duration_days: data.durationDays,
        is_active: true,
      });

      if (planError) throw planError;

      // 3. Setup webhook
      try {
        const webhookResponse = await supabase.functions.invoke("setup-telegram-webhook", {
          body: {
            project_id: project.id,
            bot_token: data.botToken,
          },
        });

        if (webhookResponse.error) {
          console.error("Webhook setup warning:", webhookResponse.error);
        }
      } catch (webhookError) {
        console.error("Webhook setup error:", webhookError);
        // Non-critical, continue
      }

      // Clear saved progress
      localStorage.removeItem(STORAGE_KEY);
      
      setCreatedProjectId(project.id);
      setCurrentStep(4);
      toast.success("Project created successfully!");
    } catch (error: any) {
      console.error("Onboarding error:", error);
      toast.error("Failed to create project", { description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    localStorage.removeItem(STORAGE_KEY);
    navigate("/projects");
  };

  const handleGoToDashboard = () => {
    localStorage.removeItem(STORAGE_KEY);
    navigate("/dashboard");
  };

  const steps = [
    <WelcomeStep key="welcome" onNext={handleNext} onSkip={handleSkip} />,
    <ProjectStep
      key="project"
      data={data}
      updateData={updateData}
      onNext={handleNext}
      onBack={handleBack}
    />,
    <BotStep
      key="bot"
      data={data}
      updateData={updateData}
      onNext={handleNext}
      onBack={handleBack}
    />,
    <PlanStep
      key="plan"
      data={data}
      updateData={updateData}
      onComplete={handleComplete}
      onBack={handleBack}
      isSubmitting={isSubmitting}
    />,
    <SuccessStep
      key="success"
      data={data}
      projectId={createdProjectId}
      onGoToDashboard={handleGoToDashboard}
    />,
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress bar */}
      {currentStep < 4 && (
        <div className="fixed top-0 left-0 right-0 h-1 bg-muted z-50">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: "0%" }}
            animate={{ width: `${((currentStep + 1) / 4) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}

      {/* Step indicator */}
      {currentStep > 0 && currentStep < 4 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-2 bg-card border rounded-full px-3 py-1.5 shadow-sm">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`h-2 w-2 rounded-full transition-colors ${
                  step <= currentStep + 1 ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
            <span className="text-xs text-muted-foreground ml-1">
              Step {currentStep + 1} of 4
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-md"
          >
            {steps[currentStep]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
