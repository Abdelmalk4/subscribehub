import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  UserPlus,
} from "lucide-react";

// Mock data
const subscribers = [
  {
    id: "1",
    telegramId: "123456789",
    username: "@john_doe",
    firstName: "John",
    project: "Crypto Signals VIP",
    plan: "Monthly",
    status: "active",
    expiryDate: "2025-01-15",
    paymentMethod: "stripe",
  },
  {
    id: "2",
    telegramId: "987654321",
    username: "@alice_w",
    firstName: "Alice",
    project: "Trading Academy",
    plan: "Yearly",
    status: "pending_approval",
    expiryDate: "2025-12-20",
    paymentMethod: "manual",
  },
  {
    id: "3",
    telegramId: "456789123",
    username: "@mike_trading",
    firstName: "Mike",
    project: "Crypto Signals VIP",
    plan: "Quarterly",
    status: "awaiting_proof",
    expiryDate: null,
    paymentMethod: "manual",
  },
  {
    id: "4",
    telegramId: "789123456",
    username: "@sarah_crypto",
    firstName: "Sarah",
    project: "Premium Forex",
    plan: "Monthly",
    status: "expired",
    expiryDate: "2024-12-01",
    paymentMethod: "stripe",
  },
  {
    id: "5",
    telegramId: "321654987",
    username: "@david_t",
    firstName: "David",
    project: "Trading Academy",
    plan: "Monthly",
    status: "active",
    expiryDate: "2025-01-25",
    paymentMethod: "stripe",
  },
];

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "pending" | "muted" | "error" }> = {
  active: { label: "Active", variant: "success" },
  pending_approval: { label: "Pending Approval", variant: "pending" },
  pending_payment: { label: "Pending Payment", variant: "warning" },
  awaiting_proof: { label: "Awaiting Proof", variant: "pending" },
  expired: { label: "Expired", variant: "muted" },
  rejected: { label: "Rejected", variant: "error" },
};

export default function Subscribers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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
          <Button variant="glass" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button variant="gradient" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Subscriber
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card variant="glass">
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-foreground">156</p>
            <p className="text-xs text-muted-foreground">Total Active</p>
          </CardContent>
        </Card>
        <Card variant="glass">
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-warning">12</p>
            <p className="text-xs text-muted-foreground">Pending Approval</p>
          </CardContent>
        </Card>
        <Card variant="glass">
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-secondary">8</p>
            <p className="text-xs text-muted-foreground">Awaiting Proof</p>
          </CardContent>
        </Card>
        <Card variant="glass">
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-muted-foreground">24</p>
            <p className="text-xs text-muted-foreground">Expired</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card variant="glass">
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by username, Telegram ID, or name..."
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
                <SelectItem value="awaiting_proof">Awaiting Proof</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="all">
              <SelectTrigger className="w-full md:w-[180px] bg-card/30 border-border/50">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent className="glass">
                <SelectItem value="all">All Projects</SelectItem>
                <SelectItem value="crypto">Crypto Signals VIP</SelectItem>
                <SelectItem value="trading">Trading Academy</SelectItem>
                <SelectItem value="forex">Premium Forex</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card variant="glass">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border/30 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Subscriber</TableHead>
                <TableHead className="text-muted-foreground">Project</TableHead>
                <TableHead className="text-muted-foreground">Plan</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground">Expiry</TableHead>
                <TableHead className="text-muted-foreground text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscribers.map((subscriber) => (
                <TableRow key={subscriber.id} className="border-border/30 hover:bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center">
                        <span className="text-sm font-medium text-foreground">
                          {subscriber.firstName[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{subscriber.username}</p>
                        <p className="text-xs text-muted-foreground font-mono">{subscriber.telegramId}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-foreground">{subscriber.project}</TableCell>
                  <TableCell>
                    <Badge variant="glass">{subscriber.plan}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusConfig[subscriber.status].variant}>
                      {subscriber.status === "active" && (
                        <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5 animate-pulse" />
                      )}
                      {statusConfig[subscriber.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {subscriber.expiryDate || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="glass">
                        <DropdownMenuItem>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        {subscriber.status === "pending_approval" && (
                          <>
                            <DropdownMenuItem className="text-success">
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">
                              <XCircle className="h-4 w-4 mr-2" />
                              Reject
                            </DropdownMenuItem>
                          </>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                          <Clock className="h-4 w-4 mr-2" />
                          Extend Subscription
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
