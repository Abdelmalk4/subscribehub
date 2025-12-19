import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { SubscriberDetails } from "@/components/subscribers/SubscriberDetails";
import { AddSubscriberDialog } from "@/components/subscribers/AddSubscriberDialog";

interface Subscriber {
  id: string;
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  status: "active" | "pending_payment" | "pending_approval" | "awaiting_proof" | "expired" | "rejected";
  plan_id: string | null;
  payment_method: string | null;
  payment_proof_url: string | null;
  invite_link: string | null;
  start_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string | null;
  project_id: string;
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

      // Apply filters
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter as any);
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
  }, [user, statusFilter, projectFilter, searchQuery, page, pageSize]);

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
  }, [statusFilter, projectFilter, searchQuery]);

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
      expiryDate.setDate(expiryDate.getDate() + 30); // Default 30 days

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

  const handleExportCSV = () => {
    const dataToExport = selectedIds.size > 0
      ? subscribers.filter((s) => selectedIds.has(s.id))
      : subscribers;

    const headers = ["Telegram ID", "Username", "First Name", "Project", "Plan", "Status", "Expiry Date", "Payment Method"];
    const rows = dataToExport.map((s) => [
      s.telegram_user_id,
      s.username || "",
      s.first_name || "",
      s.projects?.project_name || "",
      s.plans?.plan_name || "",
      s.status,
      s.expiry_date ? format(new Date(s.expiry_date), "yyyy-MM-dd") : "",
      s.payment_method || "",
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
        })
        .eq("id", subscriber.id);

      if (error) throw error;

      toast.success("Subscriber approved!");
      fetchSubscribers();
      fetchStats();
    } catch (error: any) {
      toast.error("Failed to approve", { description: error.message });
    }
  };

  const handleQuickReject = async (subscriber: Subscriber) => {
    try {
      const { error } = await supabase
        .from("subscribers")
        .update({ status: "rejected" })
        .eq("id", subscriber.id);

      if (error) throw error;

      toast.success("Subscriber rejected");
      fetchSubscribers();
      fetchStats();
    } catch (error: any) {
      toast.error("Failed to reject", { description: error.message });
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const allSelected = subscribers.length > 0 && selectedIds.size === subscribers.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < subscribers.length;

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
        <Card variant="glass" className="cursor-pointer hover:border-success/50 transition-colors" onClick={() => setStatusFilter("active")}>
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
        <Card variant="glass" className="cursor-pointer hover:border-warning/50 transition-colors" onClick={() => setStatusFilter("pending_approval")}>
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
        <Card variant="glass" className="cursor-pointer hover:border-secondary/50 transition-colors" onClick={() => setStatusFilter("awaiting_proof")}>
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
        <Card variant="glass" className="cursor-pointer hover:border-muted-foreground/50 transition-colors" onClick={() => setStatusFilter("expired")}>
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

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <Card className="bg-primary/10 border-primary/30">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm text-foreground">
              {selectedIds.size} subscriber(s) selected
            </span>
            <div className="flex gap-2">
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
      <Card variant="glass">
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px] bg-card/30 border-border/50">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="glass">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
                <SelectItem value="pending_payment">Pending Payment</SelectItem>
                <SelectItem value="awaiting_proof">Awaiting Proof</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-full md:w-[200px] bg-card/30 border-border/50">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent className="glass">
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

      {/* Table */}
      <Card variant="glass">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : subscribers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Users className="h-12 w-12 mb-2 opacity-50" />
              <p>No subscribers found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
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
                    <TableHead className="text-muted-foreground">Expiry</TableHead>
                    <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscribers.map((subscriber) => {
                    const status = statusConfig[subscriber.status] || { label: subscriber.status, variant: "muted" };
                    
                    return (
                      <TableRow
                        key={subscriber.id}
                        className={`border-border/30 hover:bg-muted/30 ${
                          selectedIds.has(subscriber.id) ? "bg-primary/5" : ""
                        }`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(subscriber.id)}
                            onCheckedChange={(checked) => handleSelectOne(subscriber.id, !!checked)}
                            aria-label={`Select ${subscriber.username || subscriber.first_name}`}
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
                        <TableCell className="text-muted-foreground">
                          {subscriber.expiry_date
                            ? format(new Date(subscriber.expiry_date), "MMM d, yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="glass">
                              <DropdownMenuItem onClick={() => handleViewDetails(subscriber)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              {(subscriber.status === "pending_approval" || subscriber.status === "awaiting_proof") && (
                                <>
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
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleViewDetails(subscriber)}>
                                <Clock className="h-4 w-4 mr-2" />
                                Extend Subscription
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
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
