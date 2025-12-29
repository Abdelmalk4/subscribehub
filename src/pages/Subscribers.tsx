import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  Filter,
  Download,
  Plus,
  MoreHorizontal,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Users,
  UserCheck,
  UserX,
  AlertCircle,
  RefreshCw,
  CalendarPlus,
  Hash,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { SubscriberDetails } from "@/components/subscribers/SubscriberDetails";
import { AddSubscriberDialog } from "@/components/subscribers/AddSubscriberDialog";

interface Subscriber {
  id: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  status: "active" | "pending_payment" | "pending_approval" | "awaiting_proof" | "expired" | "rejected" | "suspended";
  plan_id: string | null;
  payment_method: string | null;
  payment_proof_url: string | null;
  invite_link: string | null;
  start_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string | null;
  project_id: string;
  rejection_reason?: string | null;
  suspended_at?: string | null;
  suspended_by?: string | null;
  channel_joined?: boolean | null;
  channel_joined_at?: string | null;
  last_membership_check?: string | null;
  channel_membership_status?: string | null;
  projects?: { project_name: string } | null;
  plans?: { plan_name: string; price: number; currency: string | null; duration_days: number } | null;
}

interface Project {
  id: string;
  project_name: string;
}

interface Stats {
  active: number;
  pending_approval: number;
  awaiting_proof: number;
  expired: number;
}

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "pending" | "muted" | "destructive" }> = {
  active: { label: "Active", variant: "success" },
  pending_approval: { label: "Pending Approval", variant: "pending" },
  pending_payment: { label: "Pending Payment", variant: "warning" },
  awaiting_proof: { label: "Awaiting Proof", variant: "pending" },
  expired: { label: "Expired", variant: "muted" },
  rejected: { label: "Rejected", variant: "destructive" },
  suspended: { label: "Suspended", variant: "destructive" },
};

const PAGE_SIZES = [25, 50, 100];

export default function Subscribers() {
  const { user } = useAuth();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Stats>({ active: 0, pending_approval: 0, awaiting_proof: 0, expired: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedSubscriber, setSelectedSubscriber] = useState<Subscriber | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [isCheckingMembership, setIsCheckingMembership] = useState<Set<string>>(new Set());
  const [quickExtendDays, setQuickExtendDays] = useState<Record<string, string>>({});

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, project_name")
      .order("project_name");
    setProjects(data || []);
  };

  const fetchStats = async () => {
    const statuses = ["active", "pending_approval", "awaiting_proof", "expired"];
    const newStats: Stats = { active: 0, pending_approval: 0, awaiting_proof: 0, expired: 0 };

    for (const status of statuses) {
      const { count } = await supabase
        .from("subscribers")
        .select("*", { count: "exact", head: true })
        .eq("status", status as any);
      newStats[status as keyof Stats] = count || 0;
    }
    setStats(newStats);
  };

  const fetchSubscribers = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      let query = supabase
        .from("subscribers")
        .select(`
          *,
          projects!inner(project_name),
          plans(plan_name, price, currency, duration_days)
        `, { count: "exact" });

      // Apply tab-based filter
      if (activeTab === "active") {
        query = query.eq("status", "active");
      } else {
        // Apply manual status filter only for "all" tab
        if (statusFilter !== "all") {
          query = query.eq("status", statusFilter as any);
        }
      }
      
      if (projectFilter !== "all") {
        query = query.eq("project_id", projectFilter);
      }
      if (searchQuery) {
        query = query.or(`username.ilike.%${searchQuery}%,first_name.ilike.%${searchQuery}%,telegram_user_id.eq.${parseInt(searchQuery) || 0}`);
      }

      // Pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query
        .order("created_at", { ascending: false })
        .range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      setSubscribers(data || []);
      setTotalCount(count || 0);
    } catch (error: any) {
      toast.error("Failed to load subscribers", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [user, statusFilter, projectFilter, searchQuery, page, pageSize, activeTab]);

  useEffect(() => {
    fetchProjects();
    fetchStats();
  }, []);

  useEffect(() => {
    fetchSubscribers();
  }, [fetchSubscribers]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, projectFilter, searchQuery, activeTab]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(subscribers.map((s) => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;

    setIsProcessingBulk(true);
    try {
      const ids = Array.from(selectedIds);
      const startDate = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);

      const { error } = await supabase
        .from("subscribers")
        .update({
          status: "active",
          start_date: startDate.toISOString(),
          expiry_date: expiryDate.toISOString(),
          expiry_reminder_sent: false,
          final_reminder_sent: false,
        })
        .in("id", ids)
        .in("status", ["pending_approval", "awaiting_proof"]);

      if (error) throw error;

      toast.success(`Approved ${ids.length} subscriber(s)`);
      setSelectedIds(new Set());
      fetchSubscribers();
      fetchStats();
    } catch (error: any) {
      toast.error("Failed to approve", { description: error.message });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;

    setIsProcessingBulk(true);
    try {
      const ids = Array.from(selectedIds);

      const { error } = await supabase
        .from("subscribers")
        .update({ status: "rejected" })
        .in("id", ids)
        .in("status", ["pending_approval", "awaiting_proof"]);

      if (error) throw error;

      toast.success(`Rejected ${ids.length} subscriber(s)`);
      setSelectedIds(new Set());
      fetchSubscribers();
      fetchStats();
    } catch (error: any) {
      toast.error("Failed to reject", { description: error.message });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleBulkExtend = async () => {
    if (selectedIds.size === 0) return;

    setIsProcessingBulk(true);
    try {
      const ids = Array.from(selectedIds);
      const activeSubscribers = subscribers.filter(s => ids.includes(s.id) && s.status === "active");
      
      for (const sub of activeSubscribers) {
        const days = 30; // Default 30 days for bulk extend
        let baseDate: Date;
        if (sub.expiry_date) {
          const currentExpiry = new Date(sub.expiry_date);
          baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
        } else {
          baseDate = new Date();
        }
        
        const newExpiry = new Date(baseDate);
        newExpiry.setDate(newExpiry.getDate() + days);

        await supabase
          .from("subscribers")
          .update({
            expiry_date: newExpiry.toISOString(),
            expiry_reminder_sent: false,
            final_reminder_sent: false,
          })
          .eq("id", sub.id)
          .eq("status", "active");

        // Notify subscriber
        await supabase.functions.invoke("notify-subscriber", {
          body: {
            subscriber_id: sub.id,
            action: "extended",
            expiry_date: newExpiry.toISOString(),
          },
        });
      }

      toast.success(`Extended ${activeSubscribers.length} subscriber(s) by 30 days`);
      setSelectedIds(new Set());
      fetchSubscribers();
    } catch (error: any) {
      toast.error("Failed to extend", { description: error.message });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleExportCSV = () => {
    const dataToExport = selectedIds.size > 0
      ? subscribers.filter((s) => selectedIds.has(s.id))
      : subscribers;

    const headers = ["Telegram ID", "Username", "First Name", "Project", "Plan", "Status", "Expiry Date", "Payment Method", "In Channel"];
    const rows = dataToExport.map((s) => [
      s.telegram_user_id,
      s.username || "",
      s.first_name || "",
      s.projects?.project_name || "",
      s.plans?.plan_name || "",
      s.status,
      s.expiry_date ? format(new Date(s.expiry_date), "yyyy-MM-dd") : "",
      s.payment_method || "",
      s.channel_joined ? "Yes" : s.channel_joined === false ? "No" : "Unknown",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${dataToExport.length} subscriber(s)`);
  };

  const handleViewDetails = (subscriber: Subscriber) => {
    setSelectedSubscriber(subscriber);
    setDetailsOpen(true);
  };

  const handleQuickApprove = async (subscriber: Subscriber) => {
    const allowedStatuses: Subscriber["status"][] = ["pending_approval", "awaiting_proof"];
    if (!allowedStatuses.includes(subscriber.status)) {
      toast.error("Cannot approve subscriber", { 
        description: `Subscriber must be in 'Pending Approval' or 'Awaiting Proof' status. Current status: ${subscriber.status}` 
      });
      return;
    }

    try {
      const plan = subscriber.plans;
      const startDate = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + (plan?.duration_days || 30));

      const { error, count } = await supabase
        .from("subscribers")
        .update({
          status: "active",
          start_date: startDate.toISOString(),
          expiry_date: expiryDate.toISOString(),
          expiry_reminder_sent: false,
          final_reminder_sent: false,
        })
        .eq("id", subscriber.id)
        .in("status", allowedStatuses);

      if (error) throw error;
      if (count === 0) {
        toast.error("Subscriber status changed", { description: "Please refresh and try again." });
        fetchSubscribers();
        return;
      }

      try {
        const { data: notifyData, error: notifyError } = await supabase.functions.invoke("notify-subscriber", {
          body: {
            subscriber_id: subscriber.id,
            action: "approved",
            expiry_date: expiryDate.toISOString(),
          },
        });

        if (notifyError) {
          console.error("Notification error:", notifyError);
          toast.warning("Approved but notification failed", { 
            description: "Subscriber approved but could not send Telegram notification." 
          });
        } else {
          console.log("Notification sent:", notifyData);
          toast.success("Subscriber approved and notified!");
        }
      } catch (notifyErr: any) {
        console.error("Notification exception:", notifyErr);
        toast.warning("Approved but notification failed", { 
          description: notifyErr.message 
        });
      }

      fetchSubscribers();
      fetchStats();
    } catch (error: any) {
      toast.error("Failed to approve", { description: error.message });
    }
  };

  const handleQuickReject = async (subscriber: Subscriber) => {
    const allowedStatuses: Subscriber["status"][] = ["pending_approval", "awaiting_proof"];
    if (!allowedStatuses.includes(subscriber.status)) {
      toast.error("Cannot reject subscriber", { 
        description: `Subscriber must be in 'Pending Approval' or 'Awaiting Proof' status. Current status: ${subscriber.status}` 
      });
      return;
    }

    try {
      const { error, count } = await supabase
        .from("subscribers")
        .update({ status: "rejected" })
        .eq("id", subscriber.id)
        .in("status", allowedStatuses);

      if (error) throw error;
      if (count === 0) {
        toast.error("Subscriber status changed", { description: "Please refresh and try again." });
        fetchSubscribers();
        return;
      }

      try {
        const { error: notifyError } = await supabase.functions.invoke("notify-subscriber", {
          body: {
            subscriber_id: subscriber.id,
            action: "rejected",
          },
        });

        if (notifyError) {
          console.error("Notification error:", notifyError);
          toast.warning("Rejected but notification failed", { 
            description: "Subscriber rejected but could not send Telegram notification." 
          });
        } else {
          toast.success("Subscriber rejected and notified");
        }
      } catch (notifyErr: any) {
        console.error("Notification exception:", notifyErr);
        toast.warning("Rejected but notification failed", { 
          description: notifyErr.message 
        });
      }

      fetchSubscribers();
      fetchStats();
    } catch (error: any) {
      toast.error("Failed to reject", { description: error.message });
    }
  };

  const handleQuickExtend = async (subscriber: Subscriber) => {
    if (subscriber.status !== "active") {
      toast.error("Cannot extend subscription", { 
        description: `Subscriber must be 'Active' to extend. Current status: ${subscriber.status}` 
      });
      return;
    }

    const days = parseInt(quickExtendDays[subscriber.id] || "30");
    if (isNaN(days) || days <= 0) {
      toast.error("Please enter a valid number of days");
      return;
    }

    try {
      let baseDate: Date;
      if (subscriber.expiry_date) {
        const currentExpiry = new Date(subscriber.expiry_date);
        baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
      } else {
        baseDate = new Date();
      }
      
      const newExpiry = new Date(baseDate);
      newExpiry.setDate(newExpiry.getDate() + days);

      const { error, count } = await supabase
        .from("subscribers")
        .update({
          expiry_date: newExpiry.toISOString(),
          expiry_reminder_sent: false,
          final_reminder_sent: false,
        })
        .eq("id", subscriber.id)
        .eq("status", "active");

      if (error) throw error;
      if (count === 0) {
        toast.error("Subscriber status changed", { description: "Please refresh and try again." });
        fetchSubscribers();
        return;
      }

      // Notify subscriber about the extension
      try {
        await supabase.functions.invoke("notify-subscriber", {
          body: {
            subscriber_id: subscriber.id,
            action: "extended",
            expiry_date: newExpiry.toISOString(),
          },
        });
        toast.success(`Extended by ${days} days`, {
          description: `New expiry: ${format(newExpiry, "MMM d, yyyy")}`,
        });
      } catch (notifyErr: any) {
        toast.warning("Extended but notification failed");
      }

      fetchSubscribers();
    } catch (error: any) {
      toast.error("Failed to extend", { description: error.message });
    }
  };

  const handleCheckMembership = async (subscriber: Subscriber) => {
    setIsCheckingMembership(prev => new Set(prev).add(subscriber.id));
    
    try {
      const { data, error } = await supabase.functions.invoke("check-channel-membership", {
        body: {
          subscriber_id: subscriber.id,
          update_database: true,
        },
      });

      if (error) throw error;

      const result = data?.results?.[0];
      if (result) {
        if (result.is_member) {
          toast.success("User is in the channel", {
            description: `Status: ${result.status}`,
          });
        } else {
          toast.warning("User is NOT in the channel", {
            description: `Status: ${result.status}`,
          });
        }
        fetchSubscribers();
      }
    } catch (error: any) {
      toast.error("Failed to check membership", { description: error.message });
    } finally {
      setIsCheckingMembership(prev => {
        const next = new Set(prev);
        next.delete(subscriber.id);
        return next;
      });
    }
  };

  const getExpiryInfo = (expiryDate: string | null) => {
    if (!expiryDate) return { text: "—", daysLeft: null, isUrgent: false };
    
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysLeft = differenceInDays(expiry, now);
    
    return {
      text: format(expiry, "MMM d, yyyy"),
      daysLeft,
      isUrgent: daysLeft <= 7 && daysLeft >= 0,
      isExpired: daysLeft < 0,
    };
  };

  const getChannelStatusBadge = (subscriber: Subscriber) => {
    const status = subscriber.channel_membership_status;
    const joined = subscriber.channel_joined;
    
    if (joined === true || status === "member" || status === "administrator" || status === "creator") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="success" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                Yes
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Status: {status || "member"}</p>
              {subscriber.last_membership_check && (
                <p className="text-xs text-muted-foreground">
                  Checked: {format(new Date(subscriber.last_membership_check), "MMM d, HH:mm")}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    if (joined === false || status === "left" || status === "kicked") {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                No
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>Status: {status || "not in channel"}</p>
              {subscriber.last_membership_check && (
                <p className="text-xs text-muted-foreground">
                  Checked: {format(new Date(subscriber.last_membership_check), "MMM d, HH:mm")}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    return (
      <Badge variant="muted" className="gap-1">
        <AlertCircle className="h-3 w-3" />
        Unknown
      </Badge>
    );
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const allSelected = subscribers.length > 0 && selectedIds.size === subscribers.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < subscribers.length;

  const renderSubscribersTable = (showExtendColumn: boolean = false) => (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : subscribers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <Users className="h-12 w-12 mb-2 opacity-50" />
          <p className="font-semibold">No subscribers found</p>
          <p className="text-sm">Try adjusting your filters</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 border-b border-border hover:bg-muted/50">
                  <TableHead className="w-12 px-6 py-4">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                      className="rounded"
                    />
                  </TableHead>
                  <TableHead className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Name</TableHead>
                  <TableHead className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Project</TableHead>
                  <TableHead className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Plan</TableHead>
                  <TableHead className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</TableHead>
                  <TableHead className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Channel</TableHead>
                  <TableHead className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Expiry</TableHead>
                  {showExtendColumn && (
                    <TableHead className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Extend</TableHead>
                  )}
                  <TableHead className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {subscribers.map((subscriber) => {
                  const status = statusConfig[subscriber.status] || { label: subscriber.status, variant: "muted" };
                  const expiryInfo = getExpiryInfo(subscriber.expiry_date);
                  
                  return (
                    <TableRow
                      key={subscriber.id}
                      className={`hover:bg-muted/50 transition-colors ${
                        selectedIds.has(subscriber.id) ? "bg-muted/30" : ""
                      }`}
                    >
                      <TableCell className="px-6 py-4">
                        <Checkbox
                          checked={selectedIds.has(subscriber.id)}
                          onCheckedChange={(checked) => handleSelectOne(subscriber.id, !!checked)}
                          aria-label={`Select ${subscriber.username || subscriber.first_name}`}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div
                          className="flex items-center gap-3 cursor-pointer"
                          onClick={() => handleViewDetails(subscriber)}
                        >
                          <img 
                            src={`https://picsum.photos/seed/${subscriber.telegram_user_id}/32/32`} 
                            className="w-8 h-8 rounded-full border border-border" 
                            alt={subscriber.first_name || subscriber.username || "User"} 
                          />
                          <div>
                            <span className="font-semibold text-sm text-foreground">
                              {subscriber.first_name || subscriber.username || "Unknown"}
                            </span>
                            {subscriber.username && (
                              <p className="text-xs text-muted-foreground">@{subscriber.username}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-sm text-muted-foreground">
                        {subscriber.projects?.project_name || "—"}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-[10px] font-semibold">
                          {subscriber.plans?.plan_name || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          subscriber.status === 'active' 
                            ? 'bg-success/10 text-success border border-success/20' 
                            : subscriber.status === 'expired' || subscriber.status === 'rejected'
                            ? 'bg-muted text-muted-foreground border border-border'
                            : 'bg-warning/10 text-warning border border-warning/20'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            subscriber.status === 'active' ? 'bg-success' : 
                            subscriber.status === 'expired' || subscriber.status === 'rejected' ? 'bg-muted-foreground' : 'bg-warning'
                          }`} />
                          {status.label}
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getChannelStatusBadge(subscriber)}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCheckMembership(subscriber)}
                            disabled={isCheckingMembership.has(subscriber.id)}
                            className="h-6 w-6 p-0"
                          >
                            {isCheckingMembership.has(subscriber.id) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <div className="text-sm text-muted-foreground">
                          {expiryInfo.text}
                          {expiryInfo.daysLeft !== null && expiryInfo.daysLeft >= 0 && expiryInfo.daysLeft <= 7 && (
                            <span className={`block text-xs ${expiryInfo.isUrgent ? "text-warning" : ""}`}>
                              ({expiryInfo.daysLeft}d left)
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {showExtendColumn && subscriber.status === "active" && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={quickExtendDays[subscriber.id] || "30"}
                              onChange={(e) => setQuickExtendDays(prev => ({ ...prev, [subscriber.id]: e.target.value }))}
                              className="w-16 h-8 text-xs"
                              placeholder="Days"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1"
                              onClick={() => handleQuickExtend(subscriber)}
                            >
                              <CalendarPlus className="h-3 w-3" />
                              Extend
                            </Button>
                          </div>
                        </TableCell>
                      )}
                      {showExtendColumn && subscriber.status !== "active" && (
                        <TableCell>
                          <span className="text-xs text-muted-foreground">N/A</span>
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="glass-menu">
                            <DropdownMenuItem onClick={() => handleViewDetails(subscriber)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCheckMembership(subscriber)}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Check Channel Status
                            </DropdownMenuItem>
                            {(subscriber.status === "pending_approval" || subscriber.status === "awaiting_proof") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-success"
                                  onClick={() => handleQuickApprove(subscriber)}
                                >
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => handleQuickReject(subscriber)}
                                >
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Reject
                                </DropdownMenuItem>
                              </>
                            )}
                            {subscriber.status === "active" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleViewDetails(subscriber)}>
                                  <Clock className="h-4 w-4 mr-2" />
                                  Extend Subscription
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Rows per page:</span>
              <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v))}>
                <SelectTrigger className="w-[70px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={size.toString()}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Subscribers</h1>
          <p className="text-muted-foreground mt-1">
            Manage all your channel subscribers in one place.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="glass" className="gap-2" onClick={handleExportCSV}>
            <Download className="h-4 w-4" />
            Export {selectedIds.size > 0 && `(${selectedIds.size})`}
          </Button>
          <Button variant="gradient" className="gap-2" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Subscriber
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card variant="glass" className="cursor-pointer hover:border-success/50 transition-colors" onClick={() => { setActiveTab("active"); setStatusFilter("all"); }}>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/20 flex items-center justify-center">
              <UserCheck className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{stats.active}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card variant="glass" className="cursor-pointer hover:border-warning/50 transition-colors" onClick={() => { setActiveTab("all"); setStatusFilter("pending_approval"); }}>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning/20 flex items-center justify-center">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-warning">{stats.pending_approval}</p>
              <p className="text-xs text-muted-foreground">Pending Approval</p>
            </div>
          </CardContent>
        </Card>
        <Card variant="glass" className="cursor-pointer hover:border-secondary/50 transition-colors" onClick={() => { setActiveTab("all"); setStatusFilter("awaiting_proof"); }}>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-secondary/20 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-secondary">{stats.awaiting_proof}</p>
              <p className="text-xs text-muted-foreground">Awaiting Proof</p>
            </div>
          </CardContent>
        </Card>
        <Card variant="glass" className="cursor-pointer hover:border-muted-foreground/50 transition-colors" onClick={() => { setActiveTab("all"); setStatusFilter("expired"); }}>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted/50 flex items-center justify-center">
              <UserX className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-muted-foreground">{stats.expired}</p>
              <p className="text-xs text-muted-foreground">Expired</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="all" className="gap-2">
            <Users className="h-4 w-4" />
            All Subscribers
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-2">
            <CalendarPlus className="h-4 w-4" />
            Active / Extend
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {stats.active}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Bulk Actions Bar */}
        {selectedIds.size > 0 && (
          <Card className="bg-primary/10 border-primary/30 mt-4">
            <CardContent className="py-3 flex items-center justify-between">
              <span className="text-sm text-foreground">
                {selectedIds.size} subscriber(s) selected
              </span>
              <div className="flex gap-2">
                {activeTab === "all" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-success/20 border-success/30 text-success hover:bg-success/30"
                      onClick={handleBulkApprove}
                      disabled={isProcessingBulk}
                    >
                      {isProcessingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-destructive/20 border-destructive/30 text-destructive hover:bg-destructive/30"
                      onClick={handleBulkReject}
                      disabled={isProcessingBulk}
                    >
                      {isProcessingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Reject
                    </Button>
                  </>
                )}
                {activeTab === "active" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-primary/20 border-primary/30 text-primary hover:bg-primary/30"
                    onClick={handleBulkExtend}
                    disabled={isProcessingBulk}
                  >
                    {isProcessingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                    Extend 30 Days
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card variant="glass" className="mt-4">
          <CardContent className="pt-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by username, name, or Telegram ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              {activeTab === "all" && (
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-[180px] bg-card/30 border-border/50">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="glass-menu">
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending_approval">Pending Approval</SelectItem>
                    <SelectItem value="pending_payment">Pending Payment</SelectItem>
                    <SelectItem value="awaiting_proof">Awaiting Proof</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-full md:w-[200px] bg-card/30 border-border/50">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent className="glass-menu">
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.project_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <TabsContent value="all" className="mt-4">
          {renderSubscribersTable(false)}
        </TabsContent>

        <TabsContent value="active" className="mt-4">
          {renderSubscribersTable(true)}
        </TabsContent>
      </Tabs>

      {/* Details Sheet */}
      <SubscriberDetails
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        subscriber={selectedSubscriber}
        onUpdate={() => {
          fetchSubscribers();
          fetchStats();
        }}
      />

      {/* Add Subscriber Dialog */}
      <AddSubscriberDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        projects={projects}
        onSuccess={() => {
          fetchSubscribers();
          fetchStats();
        }}
      />
    </div>
  );
}
