import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { 
  Search, 
  Filter, 
  Calendar as CalendarIcon,
  X,
  SlidersHorizontal
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { QuickFilterChips } from "./QuickFilterChips";

interface Project {
  id: string;
  project_name: string;
}

interface SmartFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: string;
  onStatusChange: (status: string) => void;
  projectFilter: string;
  onProjectChange: (project: string) => void;
  projects: Project[];
  dateRange: { from: Date | undefined; to: Date | undefined };
  onDateRangeChange: (range: { from: Date | undefined; to: Date | undefined }) => void;
  quickFilter: string | null;
  onQuickFilterChange: (filter: string | null) => void;
  showStatusFilter?: boolean;
}

export function SmartFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  projectFilter,
  onProjectChange,
  projects,
  dateRange,
  onDateRangeChange,
  quickFilter,
  onQuickFilterChange,
  showStatusFilter = true,
}: SmartFiltersProps) {
  const [isDateOpen, setIsDateOpen] = useState(false);

  const hasActiveFilters = statusFilter !== "all" || projectFilter !== "all" || 
    dateRange.from || dateRange.to || quickFilter;

  const clearAllFilters = () => {
    onStatusChange("all");
    onProjectChange("all");
    onDateRangeChange({ from: undefined, to: undefined });
    onQuickFilterChange(null);
    onSearchChange("");
  };

  return (
    <Card variant="glass">
      <CardContent className="p-4 space-y-4">
        {/* Search and Main Filters Row */}
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by username, name, or Telegram ID..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 bg-card/30 border-border/50"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => onSearchChange("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Filter Controls */}
          <div className="flex flex-wrap gap-2">
            {showStatusFilter && (
              <Select value={statusFilter} onValueChange={onStatusChange}>
                <SelectTrigger className="w-[160px] bg-card/30 border-border/50">
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
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            )}

            <Select value={projectFilter} onValueChange={onProjectChange}>
              <SelectTrigger className="w-[180px] bg-card/30 border-border/50">
                <SelectValue placeholder="All Projects" />
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

            {/* Date Range Picker */}
            <Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[200px] justify-start text-left font-normal bg-card/30 border-border/50",
                    !dateRange.from && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd")}
                      </>
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    "Date range"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 glass-menu" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange.from}
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range) => {
                    onDateRangeChange({ from: range?.from, to: range?.to });
                    if (range?.to) setIsDateOpen(false);
                  }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground hover:text-foreground"
                onClick={clearAllFilters}
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Quick Filter Chips */}
        <QuickFilterChips
          activeFilter={quickFilter}
          onFilterChange={onQuickFilterChange}
        />
      </CardContent>
    </Card>
  );
}
