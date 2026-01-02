import { Copy, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TextSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useYamlViewerStore } from "@/stores/yamlViewerStore";

interface YamlViewerActionProps {
  title: string;
  description?: string;
  fetchYaml: () => Promise<string>;
  menuLabel?: string;
}

export function YamlViewerAction({
  title,
  description,
  fetchYaml,
  menuLabel = "View YAML",
}: YamlViewerActionProps) {
  const { toast } = useToast();
  const openViewer = useYamlViewerStore((state) => state.openViewer);

  const handleOpen = async () => {
    try {
      await openViewer({ title, description, fetchYaml });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to load YAML: ${error}`,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <DropdownMenuItem onClick={handleOpen}>
        <FileJson className="mr-2 h-4 w-4" />
        {menuLabel}
      </DropdownMenuItem>
    </>
  );
}

export function YamlViewerDialog() {
  const { toast } = useToast();
  const { open, title, description, content, isLoading, closeViewer } =
    useYamlViewerStore();

  const handleCopy = async () => {
    if (!content) {
      return;
    }
    await navigator.clipboard.writeText(content);
    toast({
      title: "Copied",
      description: "YAML copied to clipboard.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeViewer()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] rounded-md border">
          {isLoading ? (
            <div className="p-4">
              <TextSkeleton lines={18} />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap p-4 text-xs font-mono">
              {content}
            </pre>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={closeViewer}>
            Close
          </Button>
          <Button onClick={handleCopy} disabled={!content}>
            <Copy className="mr-2 h-4 w-4" />
            Copy YAML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
