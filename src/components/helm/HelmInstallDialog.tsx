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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { HelmChartSearchResult } from "@/generated/types";

export interface HelmInstallDialogProps {
    /** Chart to install */
    chart: HelmChartSearchResult | null;
    /** Close the dialog */
    onClose: () => void;
    /** Available namespaces */
    namespaces: string[];
    /** Release name */
    releaseName: string;
    onReleaseNameChange: (name: string) => void;
    /** Namespace */
    namespace: string;
    onNamespaceChange: (ns: string) => void;
    /** Version */
    version: string;
    onVersionChange: (version: string) => void;
    /** Values YAML */
    values: string;
    onValuesChange: (values: string) => void;
    /** Create namespace flag */
    createNamespace: boolean;
    onCreateNamespaceChange: (create: boolean) => void;
    /** Wait for ready flag */
    wait: boolean;
    onWaitChange: (wait: boolean) => void;
    /** Install handler */
    onInstall: () => void;
    /** Whether install is in progress */
    isInstalling: boolean;
}

export function HelmInstallDialog({
    chart,
    onClose,
    namespaces,
    releaseName,
    onReleaseNameChange,
    namespace,
    onNamespaceChange,
    version,
    onVersionChange,
    values,
    onValuesChange,
    createNamespace,
    onCreateNamespaceChange,
    wait,
    onWaitChange,
    onInstall,
    isInstalling,
}: HelmInstallDialogProps) {
    return (
        <Dialog open={chart !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Install Chart</DialogTitle>
                    <DialogDescription>
                        Install {chart?.name} to your cluster
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="install-release-name">Release Name</Label>
                        <Input
                            id="install-release-name"
                            value={releaseName}
                            onChange={(e) => onReleaseNameChange(e.target.value)}
                            placeholder="my-release"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="install-namespace">Namespace</Label>
                        <Select value={namespace} onValueChange={onNamespaceChange}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select namespace" />
                            </SelectTrigger>
                            <SelectContent>
                                {namespaces.map((ns) => (
                                    <SelectItem key={ns} value={ns}>
                                        {ns}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="install-version">Version (optional)</Label>
                        <Input
                            id="install-version"
                            value={version}
                            onChange={(e) => onVersionChange(e.target.value)}
                            placeholder={chart?.version || "latest"}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="install-values">Values (YAML, optional)</Label>
                        <Textarea
                            id="install-values"
                            value={values}
                            onChange={(e) => onValuesChange(e.target.value)}
                            placeholder="# Custom values&#10;replicaCount: 2"
                            className="font-mono text-sm h-32"
                        />
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="install-create-ns"
                                checked={createNamespace}
                                onCheckedChange={(checked) => onCreateNamespaceChange(checked === true)}
                            />
                            <Label htmlFor="install-create-ns" className="text-sm">Create namespace</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox
                                id="install-wait"
                                checked={wait}
                                onCheckedChange={(checked) => onWaitChange(checked === true)}
                            />
                            <Label htmlFor="install-wait" className="text-sm">Wait for ready</Label>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={onInstall}
                        disabled={!releaseName || !namespace || isInstalling}
                    >
                        {isInstalling ? "Installing..." : "Install"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
