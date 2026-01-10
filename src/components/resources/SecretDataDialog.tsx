import { useEffect, useState } from "react";
import { commands } from "@/lib/commands";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TextSkeleton } from "@/components/ui/skeleton";
import { Copy, ShieldAlert } from "lucide-react";
import { SecretKeyValueItem } from "@/components/ui/secret-value";
import { useCopyToClipboard } from "@/hooks";
import { Eye, EyeOff } from "lucide-react";

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
  const copyToClipboard = useCopyToClipboard();
  const [data, setData] = useState<Record<string, string> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && secretName && namespace) {
      setIsLoading(true);
      setError(null);
      setData(null);
      setRevealedKeys(new Set()); // Reset revealed state when dialog opens

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

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const revealAll = () => {
    if (data) {
      setRevealedKeys(new Set(Object.keys(data)));
    }
  };

  const hideAll = () => {
    setRevealedKeys(new Set());
  };

  const handleCopyAll = () => {
    if (!data) return;
    copyToClipboard(
      JSON.stringify(data, null, 2),
      "All secret data copied as JSON."
    );
  };

  const entries = data ? Object.entries(data) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Secret Data: {secretName}
            <Badge variant="outline" className="text-xs">
              <ShieldAlert className="h-3 w-3 mr-1" />
              Sensitive
            </Badge>
          </DialogTitle>
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
              {/* Reveal/Hide All buttons */}
              <div className="flex items-center gap-2 mb-3">
                <Button variant="outline" size="sm" onClick={revealAll}>
                  <Eye className="h-4 w-4 mr-2" />
                  Reveal All
                </Button>
                <Button variant="outline" size="sm" onClick={hideAll}>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Hide All
                </Button>
              </div>

              {entries.map(([key, value]) => (
                <SecretKeyValueItem
                  key={key}
                  keyName={key}
                  value={value}
                  isRevealed={revealedKeys.has(key)}
                  onToggleReveal={() => toggleReveal(key)}
                  isLoading={isLoading}
                />
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
