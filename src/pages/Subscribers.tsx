import { useState, useEffect, useCallback, useMemo } from "react";
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
  AlertCircle,
  RefreshCw,
  CalendarPlus,
  Hash,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, differenceInDays, subDays } from "date-fns";
import { SubscriberDetails } from "@/components/subscribers/SubscriberDetails";
import { AddSubscriberDialog } from "@/components/subscribers/AddSubscriberDialog";
import { SubscriberMetrics } from "@/components/subscribers/SubscriberMetrics";
import { SmartFilters } from "@/components/subscribers/SmartFilters";
import { BulkActionsBar } from "@/components/subscribers/BulkActionsBar";
import { EmptyState } from "@/components/subscribers/EmptyState";
import { motion } from "framer-motion";

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
  expiring_soon: number;
  churn_rate: number;
  mrr: number;
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
  const [stats, setStats] = useState<Stats>({ 
    active: 0, 
    pending_approval: 0, 
    awaiting_proof: 0, 
    expired: 0,
    expiring_soon: 0,
    churn_rate: 0,
    mrr: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined
  });
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
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
  const [metricsFilter, setMetricsFilter] = useState<string | null>(null);

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, project_name")
      .order("project_name");
    setProjects(data || []);
  };

  const fetchStats = async () => {
    const statuses = ["active", "pending_approval", "awaiting_proof", "expired"];
    const newStats: Stats = { 
      active: 0, 
      pending_approval: 0, 
      awaiting_proof: 0, 
      expired: 0,
      expiring_soon: 0,
      churn_rate: 0,
      mrr: 0
    };

    // Fetch basic status counts
    for (const status of statuses) {
      const { count } = await supabase
        .from("subscribers")
        .select("*", { count: "exact", head: true })
        .eq("status", status as any);
      newStats[status as keyof Pick<Stats, "active" | "pending_approval" | "awaiting_proof" | "expired">] = count || 0;
    }

    // Fetch expiring soon (within 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const { count: expiringCount } = await supabase
      .from("subscribers")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .lte("expiry_date", sevenDaysFromNow.toISOString())
      .gte("expiry_date", new Date().toISOString());
    newStats.expiring_soon = expiringCount || 0;

    // Calculate churn rate (expired in last 30 days / total active 30 days ago)
    const thirtyDaysAgo = subDays(new Date(), 30);
    const { count: recentlyExpired } = await supabase
      .from("subscribers")
      .select("*", { count: "exact", head: true })
      .eq("status", "expired")
      .gte("expiry_date", thirtyDaysAgo.toISOString());
    
    const totalActiveAndExpired = (newStats.active || 0) + (recentlyExpired || 0);
    newStats.churn_rate = totalActiveAndExpired > 0 
      ? ((recentlyExpired || 0) / totalActiveAndExpired) * 100 
      : 0;

    // Calculate MRR from active subscribers with plans
    const { data: activeWithPlans } = await supabase
      .from("subscribers")
      .select("plans(price, duration_days)")
      .eq("status", "active");
    
    if (activeWithPlans) {
      newStats.mrr = activeWithPlans.reduce((sum, sub) => {
        if (sub.plans) {
          // Convert to monthly rate
          const monthlyRate = (sub.plans.price / sub.plans.duration_days) * 30;
          return sum + monthlyRate;
        }
        return sum;
      }, 0);
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
      } else if (metricsFilter) {
        // Apply metrics card filter
        if (metricsFilter === "expiring_soon") {
          const sevenDaysFromNow = new Date();
          sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
          query = query
            .eq("status", "active")
            .lte("expiry_date", sevenDaysFromNow.toISOString())
            .gte("expiry_date", new Date().toISOString());
        } else {
          query = query.eq("status", metricsFilter as any);
        }
      } else if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as any);
      }

      // Apply quick filters
      if (quickFilter) {
        const now = new Date();
        switch (quickFilter) {
          case "expiring_7d":
            const sevenDaysFromNow = new Date();
            sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
            query = query
              .eq("status", "active")
              .lte("expiry_date", sevenDaysFromNow.toISOString())
              .gte("expiry_date", now.toISOString());
            break;
          case "pending_3d":
            const threeDaysAgo = subDays(now, 3);
            query = query
              .in("status", ["pending_approval", "awaiting_proof"])
              .lte("created_at", threeDaysAgo.toISOString());
            break;
          case "not_in_channel":
            query = query
              .eq("status", "active")
              .eq("channel_joined", false);
            break;
          case "high_value":
            // Will filter client-side for plans > $50
            break;
          case "new_today":
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            query = query.gte("created_at", startOfDay.toISOString());
            break;
        }
      }
      
      if (projectFilter !== "all") {
        query = query.eq("project_id", projectFilter);
      }
      
      if (searchQuery) {
        query = query.or(`username.ilike.%${searchQuery}%,first_name.ilike.%${searchQuery}%,telegram_user_id.eq.${parseInt(searchQuery) || 0}`);
      }

      // Date range filter
      if (dateRange.from) {
        query = query.gte("created_at", dateRange.from.toISOString());
      }
      if (dateRange.to) {
        query = query.lte("created_at", dateRange.to.toISOString());
      }

      // Pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query
        .order("created_at", { ascending: false })
        .range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      let filteredData = data || [];
      
      // Client-side filter for high value
      if (quickFilter === "high_value") {
        filteredData = filteredData.filter(s => s.plans && s.plans.price >= 50);
      }

      setSubscribers(filteredData);
      setTotalCount(quickFilter === "high_value" ? filteredData.length : (count || 0));
    } catch (error: any) {
      toast.error("Failed to load subscribers", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [user, statusFilter, projectFilter, searchQuery, page, pageSize, activeTab, quickFilter, dateRange, metricsFilter]);

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
  }, [statusFilter, projectFilter, searchQuery, activeTab, quickFilter, dateRange, metricsFilter]);

  // Calculate selected statuses for bulk actions
  const selectedStatuses = useMemo(() => {
    const result: Record<string, number> = {};
    subscribers
      .filter(s => selectedIds.has(s.id))
      .forEach(s => {
        result[s.status] = (result[s.status] || 0) + 1;
      });
    return result;
  }, [subscribers, selectedIds]);

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
        const days = 30;
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
        description: `Subscriber must be in 'Pending Approval' or 'Awaiting Proof' status.` 
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
        const { error: notifyError } = await supabase.functions.invoke("notify-subscriber", {
          body: {
            subscriber_id: subscriber.id,
            action: "approved",
            expiry_date: expiryDate.toISOString(),
          },
        });

        if (notifyError) {
          toast.warning("Approved but notification failed");
        } else {
          toast.success("Subscriber approved and notified!");
        }
      } catch {
        toast.warning("Approved but notification failed");
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
      toast.error("Cannot reject subscriber");
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
        toast.error("Subscriber status changed");
        fetchSubscribers();
        return;
      }

      try {
        await supabase.functions.invoke("notify-subscriber", {
          body: { subscriber_id: subscriber.id, action: "rejected" },
        });
        toast.success("Subscriber rejected and notified");
      } catch {
        toast.warning("Rejected but notification failed");
      }

      fetchSubscribers();
      fetchStats();
    } catch (error: any) {
      toast.error("Failed to reject", { description: error.message });
    }
  };

  const handleQuickExtend = async (subscriber: Subscriber) => {
    if (subscriber.status !== "active") {
      toast.error("Cannot extend - subscriber must be active");
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
        toast.error("Subscriber status changed");
        fetchSubscribers();
        return;
      }

      try {
        await supabase.functions.invoke("notify-subscriber", {
          body: {
            subscriber_id: subscriber.id,
            action: "extended",
            expiry_date: newExpiry.toISOString(),
          },
        });
        toast.success(`Extended by ${days} days`);
      } catch {
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
        body: { subscriber_id: subscriber.id, update_database: true },
      });

      if (error) throw error;

      const result = data?.results?.[0];
      if (result) {
        if (result.is_member) {
          toast.success("User is in the channel");
        } else {
          toast.warning("User is NOT in the channel");
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

  const handleMetricsFilterClick = (filter: string) => {
    if (metricsFilter === filter) {
      setMetricsFilter(null);
      setActiveTab("all");
      setStatusFilter("all");
    } else {
      setMetricsFilter(filter);
      setActiveTab("all");
      setQuickFilter(null);
    }
  };

  const clearAllFilters = () => {
    setStatusFilter("all");
    setProjectFilter("all");
    setDateRange({ from: undefined, to: undefined });
    setQuickFilter(null);
    setSearchQuery("");
    setMetricsFilter(null);
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
    <Card variant="glass">
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : subscribers.length === 0 ? (
          <EmptyState 
            type={searchQuery || statusFilter !== "all" || projectFilter !== "all" || quickFilter ? "no-results" : "no-subscribers"}
            onAddSubscriber={() => setAddDialogOpen(true)}
            onClearFilters={clearAllFilters}
            onRefresh={fetchSubscribers}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="border-border/30 hover:bg-transparent">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all"
                      className={someSelected ? "data-[state=checked]:bg-primary/50" : ""}
                    />
                  </TableHead>
                  <TableHead className="text-muted-foreground">Subscriber</TableHead>
                  <TableHead className="text-muted-foreground">Project</TableHead>
                  <TableHead className="text-muted-foreground">Plan</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      In Channel
                    </div>
                  </TableHead>
                  <TableHead className="text-muted-foreground">Expiry</TableHead>
                  {showExtendColumn && (
                    <TableHead className="text-muted-foreground">Quick Extend</TableHead>
                  )}
                  <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map((subscriber, index) => {
                  const status = statusConfig[subscriber.status] || { label: subscriber.status, variant: "muted" };
                  const expiryInfo = getExpiryInfo(subscriber.expiry_date);
                  
                  return (
                    <motion.tr
                      key={subscriber.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className={`border-border/30 hover:bg-muted/30 ${
                        selectedIds.has(subscriber.id) ? "bg-primary/5" : ""
                      } ${subscriber.channel_joined === false && subscriber.status === "active" ? "bg-destructive/5" : ""}`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(subscriber.id)}
                          onCheckedChange={(checked) => handleSelectOne(subscriber.id, !!checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <div
                          className="flex items-center gap-3 cursor-pointer"
                          onClick={() => handleViewDetails(subscriber)}
                        >
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center">
                            <span className="text-sm font-medium text-foreground">
                              {subscriber.first_name?.[0] || subscriber.username?.[0] || "?"}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground hover:text-primary transition-colors">
                              {subscriber.username ? `@${subscriber.username}` : subscriber.first_name || "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {subscriber.telegram_user_id}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-foreground">
                        {subscriber.projects?.project_name || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="glass">
                          {subscriber.plans?.plan_name || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant as any}>
                          {subscriber.status === "active" && (
                            <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5 animate-pulse" />
                          )}
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getChannelStatusBadge(subscriber)}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleCheckMembership(subscriber)}
                            disabled={isCheckingMembership.has(subscriber.id)}
                            className="h-6 w-6"
                          >
                            {isCheckingMembership.has(subscriber.id) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className={`text-sm ${expiryInfo.isUrgent ? "text-warning font-medium" : expiryInfo.isExpired ? "text-destructive" : "text-muted-foreground"}`}>
                          {expiryInfo.text}
                          {expiryInfo.daysLeft !== null && expiryInfo.daysLeft >= 0 && expiryInfo.daysLeft <= 7 && (
                            <span className="block text-xs">({expiryInfo.daysLeft}d left)</span>
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
                    </motion.tr>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
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
                    size="icon-sm"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
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
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg -mx-6 px-6 py-4 border-b border-border/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <span>Dashboard</span>
              <ChevronDown className="h-3 w-3 rotate-[-90deg]" />
              <span className="text-foreground">Subscribers</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Subscriber Management
              <Badge variant="secondary" className="ml-3 text-sm font-normal">
                {totalCount} total
              </Badge>
            </h1>
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="glass" className="gap-2">
                  <Download className="h-4 w-4" />
                  Export
                  {selectedIds.size > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                      {selectedIds.size}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="glass-menu">
                <DropdownMenuItem onClick={handleExportCSV}>
                  Export as CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="gradient" className="gap-2" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Subscriber
            </Button>
          </div>
        </div>
      </div>

      {/* Metrics Dashboard */}
      <SubscriberMetrics 
        stats={stats} 
        activeFilter={metricsFilter}
        onFilterClick={handleMetricsFilterClick}
      />

      {/* Tabs & Content */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setMetricsFilter(null); }} className="w-full">
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
        <div className="mt-4">
          <BulkActionsBar
            selectedCount={selectedIds.size}
            selectedStatuses={selectedStatuses}
            isProcessing={isProcessingBulk}
            onApprove={handleBulkApprove}
            onReject={handleBulkReject}
            onExtend={handleBulkExtend}
            onClear={() => setSelectedIds(new Set())}
            activeTab={activeTab}
          />
        </div>

        {/* Smart Filters */}
        <div className="mt-4">
          <SmartFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            projectFilter={projectFilter}
            onProjectChange={setProjectFilter}
            projects={projects}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            quickFilter={quickFilter}
            onQuickFilterChange={setQuickFilter}
            showStatusFilter={activeTab === "all"}
          />
        </div>

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
