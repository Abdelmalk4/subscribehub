import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Search,
  Filter,
  Eye,
  FolderOpen,
  Users,
  Calendar,
  Mail,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

interface Client {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  created_at: string | null;
  projectCount: number;
  subscriberCount: number;
  subscriptionStatus: string;
}

export default function AdminClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientProjects, setClientProjects] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    filterClients();
  }, [clients, search, statusFilter]);

  const fetchClients = async () => {
    setLoading(true);

    // Fetch profiles, projects, subscribers, and subscriptions
    const [profilesRes, projectsRes, subscribersRes, subscriptionsRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("projects").select("id, user_id"),
      supabase.from("subscribers").select("id, project_id"),
      supabase.from("client_subscriptions").select("client_id, status"),
    ]);

    const profiles = profilesRes.data || [];
    const projects = projectsRes.data || [];
    const subscribers = subscribersRes.data || [];
    const subscriptions = subscriptionsRes.data || [];

    // Build project to subscriber count map
    const projectSubscriberCount: Record<string, number> = {};
    subscribers.forEach((s) => {
      projectSubscriberCount[s.project_id] = (projectSubscriberCount[s.project_id] || 0) + 1;
    });

    // Map clients with their stats
    const clientsWithStats = profiles.map((profile) => {
      const userProjects = projects.filter((p) => p.user_id === profile.user_id);
      const subscriberCount = userProjects.reduce(
        (sum, p) => sum + (projectSubscriberCount[p.id] || 0),
        0
      );
      const subscription = subscriptions.find((s) => s.client_id === profile.user_id);

      return {
        ...profile,
        projectCount: userProjects.length,
        subscriberCount,
        subscriptionStatus: subscription?.status || "none",
      };
    });

    setClients(clientsWithStats);
    setLoading(false);
  };

  const filterClients = () => {
    let filtered = [...clients];

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.full_name?.toLowerCase().includes(searchLower) ||
          c.email?.toLowerCase().includes(searchLower)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((c) => c.subscriptionStatus === statusFilter);
    }

    setFilteredClients(filtered);
    setPage(1);
  };

  const viewClientDetails = async (client: Client) => {
    setSelectedClient(client);

    // Fetch client's projects
    const { data: projects } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", client.user_id);

    setClientProjects(projects || []);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      active: { variant: "default", label: "Active" },
      trial: { variant: "secondary", label: "Trial" },
      pending_payment: { variant: "outline", label: "Pending Payment" },
      expired: { variant: "destructive", label: "Expired" },
      none: { variant: "outline", label: "No Subscription" },
    };
    const config = variants[status] || variants.none;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const paginatedClients = filteredClients.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredClients.length / pageSize);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Client Management</h1>
        <p className="text-muted-foreground mt-1">
          View and manage all platform clients
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="pending_payment">Pending Payment</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Clients Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Clients ({filteredClients.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Projects</TableHead>
                  <TableHead>Subscribers</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">
                          {client.full_name || "Unnamed"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {client.email}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        {client.projectCount}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {client.subscriberCount}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(client.subscriptionStatus)}</TableCell>
                    <TableCell>
                      {client.created_at
                        ? format(new Date(client.created_at), "MMM dd, yyyy")
                        : "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => viewClientDetails(client)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedClients.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <p className="text-muted-foreground">No clients found</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Client Details Sheet */}
      <Sheet open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedClient && (
            <>
              <SheetHeader>
                <SheetTitle>Client Details</SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Client Info */}
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/50 to-secondary/50 flex items-center justify-center">
                      <span className="text-xl font-bold text-foreground">
                        {selectedClient.full_name?.charAt(0)?.toUpperCase() ||
                          selectedClient.email?.charAt(0)?.toUpperCase() ||
                          "?"}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {selectedClient.full_name || "Unnamed Client"}
                      </h3>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {selectedClient.email}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">
                          {selectedClient.projectCount}
                        </p>
                        <p className="text-sm text-muted-foreground">Projects</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <p className="text-2xl font-bold text-foreground">
                          {selectedClient.subscriberCount}
                        </p>
                        <p className="text-sm text-muted-foreground">Subscribers</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Joined</span>
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {selectedClient.created_at
                        ? format(new Date(selectedClient.created_at), "MMMM dd, yyyy")
                        : "N/A"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl">
                    <span className="text-sm text-muted-foreground">Subscription Status</span>
                    {getStatusBadge(selectedClient.subscriptionStatus)}
                  </div>
                </div>

                {/* Client Projects */}
                <div>
                  <h4 className="text-sm font-semibold text-foreground mb-3">Projects</h4>
                  <div className="space-y-2">
                    {clientProjects.map((project) => (
                      <Card key={project.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-foreground">
                                {project.project_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {project.channel_id}
                              </p>
                            </div>
                            <Badge
                              variant={
                                project.status === "active" ? "default" : "secondary"
                              }
                            >
                              {project.status}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {clientProjects.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No projects yet
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
