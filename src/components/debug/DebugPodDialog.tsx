import { useState, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bug, Copy, Info, AlertTriangle, Clock, Loader2 } from "lucide-react";
import type { DebugConfig, DebugOperation, DebugResult } from "@/generated/types";
import { commands } from "@/lib/commands";
import { useToast } from "@/components/ui/use-toast";
import { isK8sVersionAtLeast } from "@/lib/utils";
import { DEBUG_IMAGES } from "./constants";
import { useDebugOperation } from "@/hooks";
import { Progress } from "@/components/ui/progress";

/** Debug mode - frontend only, backend has separate commands for each mode */
type DebugMode = "ephemeralContainer" | "copyPod";

export interface DebugPodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  podName: string;
  namespace: string;
  containers: string[];
  /** Kubernetes version (e.g., "v1.28.0") for feature detection */
  kubernetesVersion?: string;
  onDebugStart: (result: DebugResult) => void;
}

export function DebugPodDialog({
  open,
  onOpenChange,
  podName,
  namespace,
  containers,
  kubernetesVersion,
  onDebugStart,
}: DebugPodDialogProps) {
  const { toast } = useToast();

  // Ephemeral containers require K8s 1.25+
  const supportsEphemeralContainers = useMemo(
    () => isK8sVersionAtLeast(kubernetesVersion, 1, 25),
    [kubernetesVersion]
  );

  const [mode, setMode] = useState<DebugMode>(
    supportsEphemeralContainers ? "ephemeralContainer" : "copyPod"
  );
  const [selectedImage, setSelectedImage] = useState("busybox:latest");
  const [customImage, setCustomImage] = useState("");
  const [targetContainer, setTargetContainer] = useState<string>(containers[0] || "");
  const [shareProcesses, setShareProcesses] = useState(true);

  const image = selectedImage === "custom" ? customImage : selectedImage;
  const isImageValid = image.trim().length > 0;

  // Timeout dialog state
  const [showTimeoutDialog, setShowTimeoutDialog] = useState(false);
  const [timeoutOperation, setTimeoutOperation] = useState<DebugOperation | null>(null);

  const handleReady = useCallback((result: DebugResult) => {
    toast({
      title: "Debug container ready",
      description: `Container "${result.containerName}" is ready in pod "${result.podName}"`,
    });
    onDebugStart(result);
    onOpenChange(false);
  }, [toast, onDebugStart, onOpenChange]);

  const handleError = useCallback((error: string) => {
    toast({
      title: "Debug failed",
      description: error,
      variant: "destructive",
    });
  }, [toast]);

  const handleTimeout = useCallback((operation: DebugOperation) => {
    setTimeoutOperation(operation);
    setShowTimeoutDialog(true);
  }, []);

  const {
    state,
    operation,
    statusReason,
    elapsedSeconds,
    startEphemeral,
    startCopyPod,
    cancel,
    continueWaiting,
  } = useDebugOperation({
    onReady: handleReady,
    onError: handleError,
    onTimeout: handleTimeout,
  });

  const isPolling = state === "creating" || state === "polling";
  const timeoutSeconds = operation?.timeoutSeconds ?? 120;
  const progressPercent = Math.min((elapsedSeconds / timeoutSeconds) * 100, 100);

  const handleDebug = async () => {
    if (!isImageValid) {
      toast({
        title: "Invalid image",
        description: "Please select or enter a valid debug image",
        variant: "destructive",
      });
      return;
    }

    const config: DebugConfig = {
      image,
      targetContainer: mode === "ephemeralContainer" ? targetContainer : null,
      command: null,
      shareProcesses: mode === "copyPod" ? shareProcesses : false,
    };

    if (mode === "ephemeralContainer") {
      await startEphemeral(podName, namespace, config);
    } else {
      await startCopyPod(podName, namespace, config);
    }
  };

  const handleCancel = async () => {
    await cancel();
  };

  const handleDialogOpenChange = (newOpen: boolean) => {
    if (!newOpen && isPolling) {
      // Don't close during polling - user must explicitly cancel
      return;
    }
    onOpenChange(newOpen);
  };

  // Timeout dialog handlers
  const handleKeepWaiting = () => {
    setShowTimeoutDialog(false);
    setTimeoutOperation(null);
    continueWaiting();
  };

  const handleDeletePod = async () => {
    if (timeoutOperation) {
      try {
        await commands.deleteDebugPod(timeoutOperation.podName, timeoutOperation.namespace);
        toast({
          title: "Debug pod deleted",
          description: `Pod "${timeoutOperation.podName}" has been deleted`,
        });
      } catch (err) {
        toast({
          title: "Failed to delete pod",
          description: String(err),
          variant: "destructive",
        });
      }
    }
    setShowTimeoutDialog(false);
    setTimeoutOperation(null);
    onOpenChange(false);
  };

  const handleLeave = () => {
    setShowTimeoutDialog(false);
    setTimeoutOperation(null);
    onOpenChange(false);
  };

  // Render timeout dialog
  if (showTimeoutDialog && timeoutOperation) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Container Not Ready
            </DialogTitle>
            <DialogDescription>
              The debug container in pod{" "}
              <span className="font-medium">{timeoutOperation.podName}</span> did not
              become ready within the timeout period.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {statusReason && (
              <div className="rounded-md border p-3 bg-muted/30">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Last status:</span>
                  <span className="font-medium">{statusReason}</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleLeave}>
              Leave
            </Button>
            <Button variant="destructive" onClick={handleDeletePod}>
              Delete Pod
            </Button>
            <Button onClick={handleKeepWaiting}>
              Keep Waiting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Render polling UI
  if (isPolling) {
    return (
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              {state === "creating" ? "Creating debug container..." : "Waiting for container..."}
            </DialogTitle>
            <DialogDescription>
              Debug container for pod <span className="font-medium">{podName}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Status */}
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">{statusReason || "Initializing..."}</span>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Elapsed</span>
                <span className="font-medium">
                  {elapsedSeconds}s / {timeoutSeconds}s
                </span>
              </div>
              <Progress value={progressPercent} className="h-2" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Render main configuration dialog
  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Debug Pod
          </DialogTitle>
          <DialogDescription>
            Debug pod <span className="font-medium">{podName}</span> in namespace{" "}
            <span className="font-medium">{namespace}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Debug Mode Selection */}
          <div className="space-y-3">
            <Label>Debug Mode</Label>
            <RadioGroup
              value={mode}
              onValueChange={(v) => setMode(v as DebugMode)}
              className="grid gap-2"
            >
              <div
                className={`flex items-center space-x-3 rounded-md border p-3 ${
                  supportsEphemeralContainers
                    ? "cursor-pointer hover:bg-muted/50"
                    : "opacity-50 cursor-not-allowed"
                }`}
              >
                <RadioGroupItem
                  value="ephemeralContainer"
                  id="ephemeral"
                  disabled={!supportsEphemeralContainers}
                />
                <Label
                  htmlFor="ephemeral"
                  className={`flex-1 ${supportsEphemeralContainers ? "cursor-pointer" : "cursor-not-allowed"}`}
                >
                  <div className="flex items-center gap-2">
                    <Bug className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Ephemeral Container</span>
                    {!supportsEphemeralContainers && (
                      <span className="text-xs text-muted-foreground">(K8s 1.25+)</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add debug container to existing pod without restart
                  </p>
                </Label>
              </div>
              <div className="flex items-center space-x-3 rounded-md border p-3 cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="copyPod" id="copy" />
                <Label htmlFor="copy" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Copy className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Copy Pod</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create a copy of the pod with debug container
                  </p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Debug Image Selection */}
          <div className="space-y-2">
            <Label htmlFor="debug-image">Debug Image</Label>
            <Select value={selectedImage} onValueChange={setSelectedImage}>
              <SelectTrigger>
                <SelectValue placeholder="Select debug image" />
              </SelectTrigger>
              <SelectContent>
                {DEBUG_IMAGES.map((img) => (
                  <SelectItem key={img.value} value={img.value}>
                    {img.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedImage === "custom" && (
              <Input
                placeholder="Enter custom image (e.g., myregistry/debug:latest)"
                value={customImage}
                onChange={(e) => setCustomImage(e.target.value)}
              />
            )}
          </div>

          {/* Target Container (for ephemeral mode) */}
          {mode === "ephemeralContainer" && containers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="target-container">Target Container</Label>
              <Select value={targetContainer} onValueChange={setTargetContainer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target container" />
                </SelectTrigger>
                <SelectContent>
                  {containers.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Debug container will share process namespace with this container
              </p>
            </div>
          )}

          {/* Share Process Namespace (for copy mode) */}
          {mode === "copyPod" && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="share-processes">Share Process Namespace</Label>
                <p className="text-xs text-muted-foreground">
                  Allow debug container to see processes from other containers
                </p>
              </div>
              <Switch
                id="share-processes"
                checked={shareProcesses}
                onCheckedChange={setShareProcesses}
              />
            </div>
          )}

          {/* Info about ephemeral containers support */}
          {!supportsEphemeralContainers && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Ephemeral containers require Kubernetes 1.25+. Your cluster version
                ({kubernetesVersion || "unknown"}) does not support this feature.
                Use "Copy Pod" mode instead.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleDebug} disabled={!isImageValid}>
            Start Debug
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
