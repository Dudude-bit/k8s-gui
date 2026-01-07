import { useEffect, useState } from "react";
import * as commands from "@/generated/commands";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TextSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { Copy } from "lucide-react";

interface SecretDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secretName: string;
  namespace: string;
}

export function SecretDataDialog({
  open,
  onOpenChange,
  secretName,
  namespace,
}: SecretDataDialogProps) {
  const { toast } = useToast();
  const [data, setData] = useState<Record<string, string> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && secretName && namespace) {
      setIsLoading(true);
      setError(null);
      setData(null);

      commands
        .getSecretData(secretName, namespace)
        .then((result) => {
          setData(result);
        })
        .catch((err) => {
          setError(String(err));
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [open, secretName, namespace]);

  const handleCopyValue = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    toast({
      title: "Copied",
      description: `Value for "${key}" copied to clipboard.`,
    });
  };

  const handleCopyAll = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast({
      title: "Copied",
      description: "All secret data copied as JSON.",
    });
  };

  const entries = data ? Object.entries(data) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Secret Data: {secretName}</DialogTitle>
          <DialogDescription>
            {namespace}/{secretName}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="p-4">
              <TextSkeleton lines={5} />
            </div>
          ) : error ? (
            <div className="p-4 text-destructive text-sm">{error}</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-muted-foreground text-sm">
              No data in this secret
            </div>
          ) : (
            <div className="space-y-2 p-1">
              {entries.map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-start gap-2 rounded-md border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      {key}
                    </div>
                    <pre className="text-sm font-mono whitespace-pre-wrap break-all">
                      {value}
                    </pre>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyValue(key, value)}
                    className="shrink-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {data && entries.length > 0 && (
            <Button onClick={handleCopyAll}>
              <Copy className="mr-2 h-4 w-4" />
              Copy All JSON
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
