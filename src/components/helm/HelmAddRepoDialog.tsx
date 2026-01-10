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

export interface HelmAddRepoDialogProps {
    /** Whether dialog is open */
    open: boolean;
    /** Close the dialog */
    onClose: () => void;
    /** Repository name */
    name: string;
    onNameChange: (name: string) => void;
    /** Repository URL */
    url: string;
    onUrlChange: (url: string) => void;
    /** Add repository handler */
    onAdd: () => void;
    /** Whether add is in progress */
    isAdding: boolean;
}

export function HelmAddRepoDialog({
    open,
    onClose,
    name,
    onNameChange,
    url,
    onUrlChange,
    onAdd,
    isAdding,
}: HelmAddRepoDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Helm Repository</DialogTitle>
                    <DialogDescription>
                        Add a new Helm chart repository to search and install charts from.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="repo-name">Repository Name</Label>
                        <Input
                            id="repo-name"
                            placeholder="e.g., bitnami"
                            value={name}
                            onChange={(e) => onNameChange(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="repo-url">Repository URL</Label>
                        <Input
                            id="repo-url"
                            placeholder="e.g., https://charts.bitnami.com/bitnami"
                            value={url}
                            onChange={(e) => onUrlChange(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={onAdd}
                        disabled={!name || !url || isAdding}
                    >
                        {isAdding ? "Adding..." : "Add Repository"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
