import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Image as ImageIcon, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface InvoiceProofUploadProps {
  invoiceId: string;
  currentProofUrl?: string | null;
  onUploadComplete: (url: string) => void;
  showSubmitButton?: boolean;
}

export function InvoiceProofUpload({
  invoiceId,
  currentProofUrl,
  onUploadComplete,
  showSubmitButton = true,
}: InvoiceProofUploadProps) {
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload JPG, PNG, WebP, or GIF.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `invoice-${invoiceId}-${Date.now()}.${fileExt}`;
      const filePath = `invoices/${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("invoice-proofs")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: signedData, error: signedError } = await supabase.storage
        .from("invoice-proofs")
        .createSignedUrl(filePath, 31536000);

      if (signedError) throw signedError;

      // Store the URL but don't call onUploadComplete yet - wait for explicit submit
      setUploadedUrl(signedData.signedUrl);
      toast.success("Image uploaded! Click 'Submit Payment Proof' to confirm.");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload payment proof");
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = () => {
    if (!uploadedUrl) {
      toast.error("Please upload an image first");
      return;
    }
    setIsSubmitting(true);
  };


  const clearPreview = () => {
    setPreviewUrl(null);
    setUploadedUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const displayUrl = previewUrl || currentProofUrl;
  const hasNewUpload = !!uploadedUrl && !isSubmitting;

  return (
    <div className="space-y-4">
      <Label>Payment Proof</Label>

      {displayUrl ? (
        <div className="relative rounded-lg border border-border overflow-hidden">
          <img
            src={displayUrl}
            alt="Payment proof"
            className="w-full max-h-64 object-contain bg-muted/30"
          />
          {!isUploading && !isSubmitting && (
            <div className="absolute top-2 right-2 flex gap-2">
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 bg-background/80"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
              </Button>
              {previewUrl && (
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-8 w-8"
                  onClick={clearPreview}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          {isUploading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <div className="flex items-center gap-2 text-primary">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Uploading...</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-2">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Click to upload payment proof
              </p>
              <p className="text-xs text-muted-foreground">
                JPG, PNG, WebP or GIF up to 5MB
              </p>
            </div>
          </div>
        </div>
      )}

      <Input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFileSelect}
        disabled={isUploading || isSubmitting}
      />

      {/* Explicit Submit Button */}
      {showSubmitButton && hasNewUpload && (
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Submit Payment Proof
            </>
          )}
        </Button>
      )}
    </div>
  );
}
