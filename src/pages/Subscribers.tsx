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
  UserCheck,
  AlertTriangle,
  CalendarPlus,
  ImageIcon,
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
  projects?: { project_name: string } | null;
  plans?: { plan_name: string; price: number; currency: string | null; duration_days: number } | null;
}

interface Project {
  id: string;
  project_name: string;
}

interface Stats {
  active: number;
  needsAction: number;
  expiringSoon: number;
  total: number;
}

const PAGE_SIZES = [25, 50, 100];

export default function Subscribers() {
  const { user } = useAuth();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Stats>({ active: 0, needsAction: 0, expiringSoon: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedSubscriber, setSelectedSubscriber] = useState<Subscriber | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [activeTab, setActiveTab] = useState("needs-action");
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, project_name")
      .order("project_name");
    setProjects(data || []);
  };

  const fetchStats = async () => {
    // Needs Action: pending_approval + awaiting_proof
    const { count: pendingCount } = await supabase
      .from("subscribers")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending_approval", "awaiting_proof"]);

    // Active
    const { count: activeCount } = await supabase
      .from("subscribers")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    // Expiring in 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const { count: expiringCount } = await supabase
      .from("subscribers")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .lte("expiry_date", sevenDaysFromNow.toISOString())
      .gt("expiry_date", new Date().toISOString());

    // Total
    const { count: totalCount } = await supabase
      .from("subscribers")
      .select("*", { count: "exact", head: true });

    setStats({
      active: activeCount || 0,
      needsAction: pendingCount || 0,
      expiringSoon: expiringCount || 0,
      total: totalCount || 0,
    });
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
      if (activeTab === "needs-action") {
        query = query.in("status", ["pending_approval", "awaiting_proof"]);
      } else if (activeTab === "active") {
        query = query.eq("status", "active");
      }
      // "all" tab shows everything
      
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
  }, [user, projectFilter, searchQuery, page, pageSize, activeTab]);

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
  }, [projectFilter, searchQuery, activeTab]);

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

  // Quick inline approve - the MAIN action for pending subscribers
  const handleApprove = async (subscriber: Subscriber) => {
    if (!["pending_approval", "awaiting_proof"].includes(subscriber.status)) return;

    setProcessingIds(prev => new Set(prev).add(subscriber.id));
    
    try {
      const plan = subscriber.plans;
      const startDate = new Date();
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + (plan?.duration_days || 30));

      const { error } = await supabase
        .from("subscribers")
        .update({
          status: "active",
          start_date: startDate.toISOString(),
          expiry_date: expiryDate.toISOString(),
          expiry_reminder_sent: false,
          final_reminder_sent: false,
        })
        .eq("id", subscriber.id)
        .in("status", ["pending_approval", "awaiting_proof"]);

      if (error) throw error;

      // Notify subscriber
      await supabase.functions.invoke("notify-subscriber", {
        body: {
          subscriber_id: subscriber.id,
          action: "approved",
          expiry_date: expiryDate.toISOString(),
        },
      });

      toast.success("Approved!", { description: `${subscriber.first_name || subscriber.username} is now active` });
      fetchSubscribers();
      fetchStats();
    } catch (error: any) {
      toast.error("Failed to approve", { description: error.message });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(subscriber.id);
        return next;
      });
    }
  };

  // Quick inline reject
  const handleReject = async (subscriber: Subscriber) => {
    if (!["pending_approval", "awaiting_proof"].includes(subscriber.status)) return;

    setProcessingIds(prev => new Set(prev).add(subscriber.id));
    
    try {
      const { error } = await supabase
        .from("subscribers")
        .update({ status: "rejected" })
        .eq("id", subscriber.id)
        .in("status", ["pending_approval", "awaiting_proof"]);

      if (error) throw error;

      await supabase.functions.invoke("notify-subscriber", {
        body: {
          subscriber_id: subscriber.id,
          action: "rejected",
        },
      });

      toast.success("Rejected", { description: "Subscriber has been notified" });
      fetchSubscribers();
      fetchStats();
    } catch (error: any) {
      toast.error("Failed to reject", { description: error.message });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(subscriber.id);
        return next;
      });
    }
  };

  // Quick extend for active subscribers
  const handleExtend = async (subscriber: Subscriber, days: number = 30) => {
    if (subscriber.status !== "active") return;

    setProcessingIds(prev => new Set(prev).add(subscriber.id));
    
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

      const { error } = await supabase
        .from("subscribers")
        .update({
          expiry_date: newExpiry.toISOString(),
          expiry_reminder_sent: false,
          final_reminder_sent: false,
        })
        .eq("id", subscriber.id)
        .eq("status", "active");

      if (error) throw error;

      await supabase.functions.invoke("notify-subscriber", {
        body: {
          subscriber_id: subscriber.id,
          action: "extended",
          expiry_date: newExpiry.toISOString(),
        },
      });

      toast.success(`Extended by ${days} days`, { description: `New expiry: ${format(newExpiry, "MMM d, yyyy")}` });
      fetchSubscribers();
    } catch (error: any) {
      toast.error("Failed to extend", { description: error.message });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(subscriber.id);
        return next;
      });
    }
  };

  // Bulk approve
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;

    setIsProcessingBulk(true);
    try {
      const ids = Array.from(selectedIds);
      const pendingSubscribers = subscribers.filter(
        s => ids.includes(s.id) && ["pending_approval", "awaiting_proof"].includes(s.status)
      );
      
      let successCount = 0;
      for (const sub of pendingSubscribers) {
        const plan = sub.plans;
        const durationDays = plan?.duration_days || 30;
        const startDate = new Date();
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + durationDays);

        const { error } = await supabase
          .from("subscribers")
          .update({
            status: "active",
            start_date: startDate.toISOString(),
            expiry_date: expiryDate.toISOString(),
            expiry_reminder_sent: false,
            final_reminder_sent: false,
          })
          .eq("id", sub.id);

        if (!error) {
          successCount++;
          await supabase.functions.invoke("notify-subscriber", {
            body: {
              subscriber_id: sub.id,
              action: "approved",
              expiry_date: expiryDate.toISOString(),
            },
          });
        }
      }

      toast.success(`Approved ${successCount} subscriber(s)`);
      setSelectedIds(new Set());
      fetchSubscribers();
      fetchStats();
    } catch (error: any) {
      toast.error("Failed to approve", { description: error.message });
    } finally {
      setIsProcessingBulk(false);
    }
  };

  const handleExportCSV = () => {
    const dataToExport = selectedIds.size > 0
      ? subscribers.filter((s) => selectedIds.has(s.id))
      : subscribers;

    const headers = ["Telegram ID", "Username", "Name", "Project", "Plan", "Status", "Expiry"];
    const rows = dataToExport.map((s) => [
      s.telegram_user_id,
      s.username || "",
      s.first_name || "",
      s.projects?.project_name || "",
      s.plans?.plan_name || "",
      s.status,
      s.expiry_date ? format(new Date(s.expiry_date), "yyyy-MM-dd") : "",
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

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getExpiryInfo = (expiryDate: string | null) => {
    if (!expiryDate) return { text: "—", daysLeft: null, isUrgent: false };
    
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysLeft = differenceInDays(expiry, now);
    
    return {
      text: format(expiry, "MMM d"),
      daysLeft,
      isUrgent: daysLeft <= 7 && daysLeft >= 0,
      isExpired: daysLeft < 0,
    };
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const allSelected = subscribers.length > 0 && selectedIds.size === subscribers.length;

  // Render the Needs Action card for a subscriber (prominent approve/reject)
  const renderNeedsActionRow = (subscriber: Subscriber) => {
    const hasProof = !!subscriber.payment_proof_url;
    const isProcessing = processingIds.has(subscriber.id);
    
    return (
      <div
        key={subscriber.id}
        className="flex items-center justify-between p-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Checkbox
            checked={selectedIds.has(subscriber.id)}
            onCheckedChange={(checked) => handleSelectOne(subscriber.id, !!checked)}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-foreground truncate">
                {subscriber.first_name || subscriber.username || "Unknown"}
              </span>
              {subscriber.username && (
                <span className="text-xs text-muted-foreground">@{subscriber.username}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{subscriber.projects?.project_name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{subscriber.plans?.plan_name || "No plan"}</span>
              {subscriber.plans?.price && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-xs font-medium text-foreground">${subscriber.plans.price}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Time ago */}
          <span className="text-xs text-muted-foreground hidden sm:block">
            {subscriber.created_at && getTimeAgo(subscriber.created_at)}
          </span>
          
          {/* Payment proof indicator */}
          {hasProof && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1 text-xs"
              onClick={() => handleViewDetails(subscriber)}
            >
              <ImageIcon className="h-3 w-3" />
              <span className="hidden sm:inline">Proof</span>
            </Button>
          )}
          
          {/* PROMINENT Approve/Reject buttons */}
          <Button
            variant="default"
            size="sm"
            className="h-7 px-3 gap-1.5 bg-success hover:bg-success/90 text-white"
            onClick={() => handleApprove(subscriber)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle className="h-3 w-3" />
            )}
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={() => handleReject(subscriber)}
            disabled={isProcessing}
          >
            <XCircle className="h-3 w-3" />
            Reject
          </Button>
        </div>
      </div>
    );
  };

  // Render standard table row for All/Active tabs
  const renderTableRow = (subscriber: Subscriber, showExtend: boolean = false) => {
    const expiryInfo = getExpiryInfo(subscriber.expiry_date);
    const isProcessing = processingIds.has(subscriber.id);
    const isPending = ["pending_approval", "awaiting_proof"].includes(subscriber.status);
    
    return (
      <TableRow key={subscriber.id} className="hover:bg-muted/30">
        <TableCell className="w-8">
          <Checkbox
            checked={selectedIds.has(subscriber.id)}
            onCheckedChange={(checked) => handleSelectOne(subscriber.id, !!checked)}
          />
        </TableCell>
        <TableCell>
          <div
            className="cursor-pointer"
            onClick={() => handleViewDetails(subscriber)}
          >
            <span className="font-medium text-sm">
              {subscriber.first_name || subscriber.username || "Unknown"}
            </span>
            {subscriber.username && (
              <p className="text-xs text-muted-foreground">@{subscriber.username}</p>
            )}
          </div>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
          {subscriber.projects?.project_name || "—"}
        </TableCell>
        <TableCell className="hidden md:table-cell">
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
            {subscriber.plans?.plan_name || "—"}
          </span>
        </TableCell>
        <TableCell>
          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
            subscriber.status === 'active' 
              ? 'bg-success/10 text-success' 
              : isPending
              ? 'bg-warning/10 text-warning'
              : 'bg-muted text-muted-foreground'
          }`}>
            <div className={`w-1 h-1 rounded-full ${
              subscriber.status === 'active' ? 'bg-success' : 
              isPending ? 'bg-warning' : 'bg-muted-foreground'
            }`} />
            {subscriber.status === 'active' ? 'Active' : 
             subscriber.status === 'pending_approval' ? 'Pending' :
             subscriber.status === 'awaiting_proof' ? 'Awaiting' :
             subscriber.status === 'expired' ? 'Expired' :
             subscriber.status === 'rejected' ? 'Rejected' : subscriber.status}
          </div>
        </TableCell>
        <TableCell className="hidden sm:table-cell">
          <div className="text-xs text-muted-foreground">
            {expiryInfo.text}
            {expiryInfo.daysLeft !== null && expiryInfo.daysLeft >= 0 && expiryInfo.daysLeft <= 7 && (
              <span className="text-warning ml-1">({expiryInfo.daysLeft}d)</span>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {/* Quick actions based on status */}
            {isPending && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-success hover:bg-success/10"
                  onClick={() => handleApprove(subscriber)}
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                  onClick={() => handleReject(subscriber)}
                  disabled={isProcessing}
                >
                  <XCircle className="h-3 w-3" />
                </Button>
              </>
            )}
            {showExtend && subscriber.status === "active" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs gap-1"
                onClick={() => handleExtend(subscriber)}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarPlus className="h-3 w-3" />}
                +30d
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleViewDetails(subscriber)} className="text-xs">
                  <Eye className="h-3 w-3 mr-1.5" />
                  View Details
                </DropdownMenuItem>
                {subscriber.status === "active" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleExtend(subscriber, 7)} className="text-xs">
                      <CalendarPlus className="h-3 w-3 mr-1.5" />
                      Extend 7 days
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExtend(subscriber, 30)} className="text-xs">
                      <CalendarPlus className="h-3 w-3 mr-1.5" />
                      Extend 30 days
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold text-foreground">Subscribers</h1>
          <p className="text-muted-foreground text-xs">Manage payments and subscriber access.</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={handleExportCSV}>
            <Download className="h-3 w-3" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-3 w-3" />
            Add
          </Button>
        </div>
      </div>

      {/* Stats Cards - Simplified */}
      <div className="grid grid-cols-3 gap-2.5">
        <Card 
          className={`cursor-pointer transition-colors ${activeTab === 'needs-action' ? 'border-warning/50 bg-warning/5' : 'hover:border-warning/30'}`}
          onClick={() => setActiveTab("needs-action")}
        >
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-warning/20 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className={`text-xl font-bold ${stats.needsAction > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                {stats.needsAction}
              </p>
              <p className="text-[10px] text-muted-foreground">Needs Action</p>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-colors ${activeTab === 'active' ? 'border-success/50 bg-success/5' : 'hover:border-success/30'}`}
          onClick={() => setActiveTab("active")}
        >
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-success/20 flex items-center justify-center">
              <UserCheck className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{stats.active}</p>
              <p className="text-[10px] text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-colors ${activeTab === 'all' ? 'border-primary/50 bg-primary/5' : 'hover:border-muted-foreground/30'}`}
          onClick={() => setActiveTab("all")}
        >
          <CardContent className="p-3 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{stats.total}</p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between gap-3">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="needs-action" className="gap-1.5 text-xs">
              <AlertTriangle className="h-3 w-3" />
              Needs Action
              {stats.needsAction > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">
                  {stats.needsAction}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-1.5 text-xs">
              <UserCheck className="h-3 w-3" />
              Active
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1.5 text-xs">
              <Users className="h-3 w-3" />
              All
            </TabsTrigger>
          </TabsList>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-7 text-xs w-40"
              />
            </div>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-[140px] h-7 text-xs">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Projects</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id} className="text-xs">
                    {project.project_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <Card className="bg-primary/5 border-primary/30 mt-3">
            <CardContent className="py-2 flex items-center justify-between">
              <span className="text-xs text-foreground">
                {selectedIds.size} selected
              </span>
              <div className="flex gap-1.5">
                {activeTab === "needs-action" && (
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5 h-6 text-[10px] bg-success hover:bg-success/90"
                    onClick={handleBulkApprove}
                    disabled={isProcessingBulk}
                  >
                    {isProcessingBulk ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                    Approve All
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Needs Action Tab - Card-based layout with prominent buttons */}
        <TabsContent value="needs-action" className="mt-3">
          <Card>
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : subscribers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <CheckCircle className="h-10 w-10 mb-2 text-success/50" />
                <p className="font-medium text-sm">All caught up!</p>
                <p className="text-xs">No pending approvals at the moment.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {subscribers.map(renderNeedsActionRow)}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Active Tab */}
        <TabsContent value="active" className="mt-3">
          <Card>
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : subscribers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Users className="h-8 w-8 mb-1.5 opacity-50" />
                <p className="text-xs">No active subscribers</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-8">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Project</TableHead>
                      <TableHead className="hidden md:table-cell">Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Expiry</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscribers.map((s) => renderTableRow(s, true))}
                  </TableBody>
                </Table>
                {/* Pagination */}
                <div className="flex items-center justify-between px-3 py-2.5 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Rows:</span>
                    <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v))}>
                      <SelectTrigger className="w-[60px] h-6 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZES.map((size) => (
                          <SelectItem key={size} value={size.toString()} className="text-xs">
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={page >= totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>
        </TabsContent>

        {/* All Tab */}
        <TabsContent value="all" className="mt-3">
          <Card>
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : subscribers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Users className="h-8 w-8 mb-1.5 opacity-50" />
                <p className="text-xs">No subscribers found</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-8">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Project</TableHead>
                      <TableHead className="hidden md:table-cell">Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Expiry</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscribers.map((s) => renderTableRow(s, false))}
                  </TableBody>
                </Table>
                {/* Pagination */}
                <div className="flex items-center justify-between px-3 py-2.5 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Rows:</span>
                    <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(parseInt(v))}>
                      <SelectTrigger className="w-[60px] h-6 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZES.map((size) => (
                          <SelectItem key={size} value={size.toString()} className="text-xs">
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        disabled={page >= totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Card>
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
