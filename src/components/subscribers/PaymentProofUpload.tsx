import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Image as ImageIcon, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PaymentProofUploadProps {
  projectId: string;
  subscriberId: string;
  currentProofUrl?: string | null;
  onUploadComplete: (url: string) => void;
}

export function PaymentProofUpload({
  projectId,
  subscriberId,
  currentProofUrl,
  onUploadComplete,
}: PaymentProofUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload JPG, PNG, WebP, or GIF.");
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreviewUrl(e.target?.result as string);
    reader.readAsDataURL(file);

    // Upload to storage
    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${subscriberId}-${Date.now()}.${fileExt}`;
      const filePath = `${projectId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("payment-proofs")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get signed URL (valid for 1 year)
      const { data: signedData, error: signedError } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(filePath, 31536000); // 1 year

      if (signedError) throw signedError;

      const publicUrl = signedData.signedUrl;

      // Update subscriber with proof URL
      const { error: updateError } = await supabase
        .from("subscribers")
        .update({ payment_proof_url: publicUrl })
        .eq("id", subscriberId);

      if (updateError) throw updateError;

      onUploadComplete(publicUrl);
      toast.success("Payment proof uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload payment proof");
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const displayUrl = previewUrl || currentProofUrl;

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
          {!isUploading && (
            <div className="absolute top-2 right-2 flex gap-2">
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 bg-background/80 backdrop-blur-sm"
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
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
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
        disabled={isUploading}
      />
    </div>
  );
}
