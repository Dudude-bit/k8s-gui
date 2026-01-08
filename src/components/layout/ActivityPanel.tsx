import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Network, Terminal, Loader2 } from "lucide-react";
import { usePortForwardStore } from "@/stores/portForwardStore";
import { useTerminalSessionStore } from "@/stores/terminalSessionStore";
import { useBackgroundJobStore } from "@/stores/backgroundJobStore";
import { PortForwardsTab } from "./activity/PortForwardsTab";
import { TerminalsTab } from "./activity/TerminalsTab";
import { BackgroundJobsTab } from "./activity/BackgroundJobsTab";

export function ActivityPanel() {
  const [open, setOpen] = useState(false);

  // Get counts for badge
  const portForwardSessions = usePortForwardStore((state) => state.sessions);
  const terminalSessions = useTerminalSessionStore((state) => state.sessions);
  const activeJobs = useBackgroundJobStore((state) =>
    state.jobs.filter(
      (job) => job.status === "pending" || job.status === "running"
    )
  );

  const activeTerminals = terminalSessions.filter(
    (s) => s.status === "connected"
  ).length;

  const totalActive =
    portForwardSessions.length + activeTerminals + activeJobs.length;

  const handleClose = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Activity panel"
        >
          <Activity className="h-4 w-4" />
          {totalActive > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[10px] flex items-center justify-center"
            >
              {totalActive > 99 ? "99+" : totalActive}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[450px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activity
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="port-forwards" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="port-forwards" className="gap-1.5 text-xs">
              <Network className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ports</span>
              {portForwardSessions.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-4 min-w-[16px] px-1 text-[10px]"
                >
                  {portForwardSessions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="terminals" className="gap-1.5 text-xs">
              <Terminal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Terminals</span>
              {activeTerminals > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-4 min-w-[16px] px-1 text-[10px]"
                >
                  {activeTerminals}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-1.5 text-xs">
              <Loader2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Jobs</span>
              {activeJobs.length > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-4 min-w-[16px] px-1 text-[10px]"
                >
                  {activeJobs.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="port-forwards" className="m-0">
              <PortForwardsTab onClose={handleClose} />
            </TabsContent>
            <TabsContent value="terminals" className="m-0">
              <TerminalsTab onClose={handleClose} />
            </TabsContent>
            <TabsContent value="jobs" className="m-0">
              <BackgroundJobsTab />
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
