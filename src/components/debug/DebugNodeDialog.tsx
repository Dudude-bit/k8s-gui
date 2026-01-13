import { useState } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Server } from "lucide-react";
import type { DebugConfig, DebugOperation } from "@/generated/types";
import { commands } from "@/lib/commands";
import { useToast } from "@/components/ui/use-toast";
import { Spinner } from "@/components/ui/spinner";
import { DEBUG_IMAGES } from "./constants";

export interface DebugNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeName: string;
  onDebugStart: (operation: DebugOperation) => void;
}

export function DebugNodeDialog({
  open,
  onOpenChange,
  nodeName,
  onDebugStart,
}: DebugNodeDialogProps) {
  const { toast } = useToast();
  const [selectedImage, setSelectedImage] = useState("busybox:latest");
  const [customImage, setCustomImage] = useState("");
  const [namespace, setNamespace] = useState("default");
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
        targetContainer: null,
        command: null,
        shareProcesses: false,
      };

      const result = await commands.debugNode(nodeName, namespace, config);

      toast({
        title: "Debug pod ready",
        description: `Debug pod "${result.podName}" created on node "${nodeName}"`,
      });

      onDebugStart(result);
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
            <Server className="h-5 w-5" />
            Debug Node
          </DialogTitle>
          <DialogDescription>
            Create a privileged debug pod on node{" "}
            <span className="font-medium">{nodeName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Node Info */}
          <div className="rounded-md border p-3 bg-muted/30">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Target Node</span>
              <span className="font-medium">{nodeName}</span>
            </div>
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

          {/* Namespace for debug pod */}
          <div className="space-y-2">
            <Label htmlFor="namespace">Debug Pod Namespace</Label>
            <Input
              id="namespace"
              placeholder="default"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Namespace where the debug pod will be created
            </p>
          </div>

          {/* Warning about privileged access */}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This will create a <strong>privileged pod</strong> with full access to
              the host. The host filesystem will be mounted at{" "}
              <code className="bg-muted px-1 rounded">/host</code>.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleDebug}
            disabled={isLoading || !isImageValid}
            variant="destructive"
          >
            {isLoading && <Spinner size="sm" className="mr-2" />}
            {isLoading ? "Starting..." : "Start Debug"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
