import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  User,
  Bell,
  Shield,
  Key,
  Save,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export default function Settings() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user?.id)
        .single();

      if (error) throw error;

      setProfile(data);
      setFullName(data.full_name || "");
      setEmail(data.email || user?.email || "");
    } catch (error) {
      console.error("Error fetching profile:", error);
      setFullName(user?.user_metadata?.full_name || "");
      setEmail(user?.email || "");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          email: email,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user?.id);

      if (error) throw error;

      toast.success("Settings saved successfully!");
    } catch (error: any) {
      toast.error("Failed to save settings", {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast.success("Password updated successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast.error("Failed to update password", {
        description: error.message,
      });
    } finally {
      setUpdatingPassword(false);
    }
  };

  const getInitials = () => {
    if (fullName && fullName.includes(" ")) {
      const parts = fullName.split(" ");
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return fullName?.substring(0, 2).toUpperCase() || email?.substring(0, 2).toUpperCase() || "U";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-base font-semibold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-xs">Manage your account and preferences.</p>
      </div>

      {/* Profile Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <User className="h-3.5 w-3.5 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Profile</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">Update your personal information</p>
        
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-sm font-bold text-white">{getInitials()}</span>
            </div>
            <div>
              <Button variant="outline" size="sm" className="h-6 text-xs px-2">Change Avatar</Button>
              <p className="text-[10px] text-gray-500 mt-0.5">JPG, PNG or GIF. Max 2MB</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="fullName" className="text-xs">Full Name</Label>
                <Input 
                  id="fullName" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="email" className="text-xs">Email Address</Label>
                <Input 
                  id="email" 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Bell className="h-3.5 w-3.5 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">Configure how you receive notifications</p>
        
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900 text-xs">Email Notifications</p>
              <p className="text-[10px] text-gray-500">Receive updates via email</p>
            </div>
            <Switch defaultChecked className="scale-75" />
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900 text-xs">New Subscriber Alerts</p>
              <p className="text-[10px] text-gray-500">Get notified when someone subscribes</p>
            </div>
            <Switch defaultChecked className="scale-75" />
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900 text-xs">Payment Alerts</p>
              <p className="text-[10px] text-gray-500">Notifications for payment events</p>
            </div>
            <Switch defaultChecked className="scale-75" />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium text-gray-900 text-xs">Expiry Reminders</p>
              <p className="text-[10px] text-gray-500">Alerts for expiring subscriptions</p>
            </div>
            <Switch defaultChecked className="scale-75" />
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Shield className="h-3.5 w-3.5 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Security</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">Manage your account security</p>
        
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="currentPassword" className="text-xs">Current Password</Label>
            <Input 
              id="currentPassword" 
              type="password" 
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="newPassword" className="text-xs">New Password</Label>
              <Input 
                id="newPassword" 
                type="password" 
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword" className="text-xs">Confirm Password</Label>
              <Input 
                id="confirmPassword" 
                type="password" 
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            className="h-7 text-xs"
            onClick={handleUpdatePassword}
            disabled={updatingPassword || !newPassword || !confirmPassword}
          >
            {updatingPassword ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Key className="h-3 w-3 mr-1.5" />
            )}
            Update Password
          </Button>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-3 w-3 mr-1.5" />
          )}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
