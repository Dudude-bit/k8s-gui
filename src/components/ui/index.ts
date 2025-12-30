/**
 * UI Components - Design System Exports
 *
 * Centralized exports for all UI components.
 */

// Core shadcn/ui components
export { Button, buttonVariants } from "./button";
export { Badge, badgeVariants } from "./badge";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./card";
export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
export { Input } from "./input";
export { Label } from "./label";
export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
export { Skeleton } from "./skeleton";
export { Switch } from "./switch";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
export { Progress } from "./progress";
export { ScrollArea } from "./scroll-area";
export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
export { useToast, toast } from "./use-toast";

// Custom design system components
export {
  StatusBadge,
  ConditionBadge,
  ResourceTypeBadge,
  statusBadgeVariants,
} from "./status-badge";
export type {
  StatusBadgeProps,
  ConditionBadgeProps,
  ResourceTypeBadgeProps,
  ResourceType,
} from "./status-badge";

export {
  MetricCard,
  MetricBadge,
  MetricRow,
  MetricPair,
  NodeResourceCard,
} from "./metric-card";
export type {
  MetricCardProps,
  MetricBadgeProps,
  MetricRowProps,
  MetricPairProps,
  NodeResourceCardProps,
} from "./metric-card";

export { ActionMenu } from "./action-menu";
export { ConfirmDialog } from "./confirm-dialog";
export { RefreshButton } from "./refresh-button";
export { DataTable } from "./data-table";
