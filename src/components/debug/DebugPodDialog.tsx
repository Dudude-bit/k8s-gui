import { useState, useMemo } from "react";
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
import { Bug, Copy, Info } from "lucide-react";
import type { DebugConfig, DebugOperation } from "@/generated/types";
import { commands } from "@/lib/commands";
import { useToast } from "@/components/ui/use-toast";
import { Spinner } from "@/components/ui/spinner";
import { isK8sVersionAtLeast } from "@/lib/utils";
import { DEBUG_IMAGES } from "./constants";

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
  onDebugStart: (operation: DebugOperation) => void;
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
  const [isLoading, setIsLoading] = useState(false);

  const image = selectedImage === "custom" ? customImage : selectedImage;
  const isImageValid = image.trim().length > 0;

  const handleDebug = async () => {
    if (!isImageValid) {
      toast({
        title: "Invalid image",
        description: "Please select or enter a valid debug image",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const config: DebugConfig = {
        image,
        targetContainer: mode === "ephemeralContainer" ? targetContainer : null,
        command: null,
        shareProcesses: mode === "copyPod" ? shareProcesses : false,
      };

      let operation: DebugOperation;

      if (mode === "ephemeralContainer") {
        operation = await commands.debugPodEphemeral(podName, namespace, config);
      } else {
        operation = await commands.debugPodCopy(podName, namespace, config);
      }

      toast({
        title: "Debug container ready",
        description: `Container "${operation.containerName}" is ready in pod "${operation.podName}"`,
      });

      onDebugStart(operation);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Debug failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <Button onClick={handleDebug} disabled={isLoading || !isImageValid}>
            {isLoading && <Spinner size="sm" className="mr-2" />}
            {isLoading ? "Starting..." : "Start Debug"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
