import { useCallback, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import CodeMirror from "@uiw/react-codemirror";
import { yaml as yamlLanguage } from "@codemirror/lang-yaml";
import { EditorView } from "@codemirror/view";
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
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/use-toast";
import { useThemeStore } from "@/stores/themeStore";
import { useClusterStore } from "@/stores/clusterStore";
import {
  useYamlEditorStore,
  type ManifestResult,
  type ResourceKey,
} from "@/stores/yamlEditorStore";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  History,
  Copy,
  RotateCcw,
  AlignLeft,
  Play,
  FileCheck,
  Loader2,
  GitCompare,
  FileJson,
} from "lucide-react";

// Simple diff implementation
interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber: number;
}

function computeDiff(original: string, modified: string): DiffLine[] {
  const originalLines = original.split("\n");
  const modifiedLines = modified.split("\n");
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const lcs = computeLCS(originalLines, modifiedLines);

  let origIdx = 0;
  let modIdx = 0;
  let lineNum = 1;

  for (const match of lcs) {
    // Add removed lines
    while (origIdx < match.origIdx) {
      result.push({
        type: "removed",
        content: originalLines[origIdx],
        lineNumber: lineNum++,
      });
      origIdx++;
    }

    // Add added lines
    while (modIdx < match.modIdx) {
      result.push({
        type: "added",
        content: modifiedLines[modIdx],
        lineNumber: lineNum++,
      });
      modIdx++;
    }

    // Add unchanged line
    result.push({
      type: "unchanged",
      content: originalLines[origIdx],
      lineNumber: lineNum++,
    });
    origIdx++;
    modIdx++;
  }

  // Add remaining removed lines
  while (origIdx < originalLines.length) {
    result.push({
      type: "removed",
      content: originalLines[origIdx],
      lineNumber: lineNum++,
    });
    origIdx++;
  }

  // Add remaining added lines
  while (modIdx < modifiedLines.length) {
    result.push({
      type: "added",
      content: modifiedLines[modIdx],
      lineNumber: lineNum++,
    });
    modIdx++;
  }

  return result;
}

interface LCSMatch {
  origIdx: number;
  modIdx: number;
}

function computeLCS(original: string[], modified: string[]): LCSMatch[] {
  const m = original.length;
  const n = modified.length;

  // Create DP table
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (original[i - 1] === modified[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find matches
  const matches: LCSMatch[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (original[i - 1] === modified[j - 1]) {
      matches.unshift({ origIdx: i - 1, modIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matches;
}

// Diff Viewer Component
function DiffViewer({
  original,
  modified,
}: {
  original: string;
  modified: string;
}) {
  const diffLines = useMemo(
    () => computeDiff(original, modified),
    [original, modified]
  );

  const hasChanges = diffLines.some((line) => line.type !== "unchanged");

  if (!hasChanges) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground py-8">
        <CheckCircle2 className="mr-2 h-4 w-4" />
        No changes detected
      </div>
    );
  }

  return (
    <ScrollArea className="h-[500px] rounded-md border">
      <div className="p-2 font-mono text-xs">
        {diffLines.map((line, idx) => (
          <div
            key={idx}
            className={`px-2 py-0.5 ${
              line.type === "added"
                ? "bg-green-500/20 text-green-700 dark:text-green-300"
                : line.type === "removed"
                  ? "bg-red-500/20 text-red-700 dark:text-red-300"
                  : ""
            }`}
          >
            <span className="inline-block w-6 text-muted-foreground mr-2">
              {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
            </span>
            <span className="whitespace-pre">{line.content}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// Result Display Component
function ResultDisplay({ result }: { result: ManifestResult }) {
  return (
    <div
      className={`rounded-lg border p-3 text-xs ${
        result.success
          ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800"
          : "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200 border-red-200 dark:border-red-800"
      }`}
    >
      <div className="flex items-center gap-2 font-semibold mb-1">
        {result.success ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <XCircle className="h-4 w-4" />
        )}
        {result.success ? "Success" : "Error"}
      </div>
      {result.stdout && (
        <pre className="whitespace-pre-wrap text-xs mt-2">{result.stdout}</pre>
      )}
      {result.stderr && (
        <pre className="whitespace-pre-wrap text-xs mt-2 text-red-600 dark:text-red-400">
          {result.stderr}
        </pre>
      )}
    </div>
  );
}

// Main Editor Action Props
interface YamlEditorActionProps {
  title: string;
  resourceKey: ResourceKey;
  fetchYaml: () => Promise<string>;
  menuLabel?: string;
}

// Button-based action for use in headers/toolbars
export function YamlEditorAction({
  title,
  resourceKey,
  fetchYaml,
  menuLabel = "Edit YAML",
}: YamlEditorActionProps) {
  const { toast } = useToast();
  const openEditor = useYamlEditorStore((state) => state.openEditor);

  const handleOpen = async () => {
    try {
      await openEditor({ title, resourceKey, fetchYaml });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to load YAML: ${error}`,
        variant: "destructive",
      });
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleOpen}>
      <FileJson className="mr-2 h-4 w-4" />
      {menuLabel}
    </Button>
  );
}

// DropdownMenuItem-based action for use in action menus
export function YamlEditorMenuAction({
  title,
  resourceKey,
  fetchYaml,
  menuLabel = "Edit YAML",
}: YamlEditorActionProps) {
  const { toast } = useToast();
  const openEditor = useYamlEditorStore((state) => state.openEditor);

  const handleOpen = async () => {
    try {
      await openEditor({ title, resourceKey, fetchYaml });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to load YAML: ${error}`,
        variant: "destructive",
      });
    }
  };

  return (
    <DropdownMenuItem onClick={handleOpen}>
      <FileJson className="mr-2 h-4 w-4" />
      {menuLabel}
    </DropdownMenuItem>
  );
}

// Main Dialog Component
export function YamlEditorDialog() {
  const { toast } = useToast();
  const theme = useThemeStore((state) => state.theme);
  const currentNamespace = useClusterStore((state) => state.currentNamespace);

  const {
    open,
    title,
    resourceKey,
    originalContent,
    editedContent,
    isLoading,
    isValidating,
    isApplying,
    showDiff,
    validationResult,
    applyResult,
    closeEditor,
    setEditedContent,
    setShowDiff,
    setValidationResult,
    setApplyResult,
    setIsValidating,
    setIsApplying,
    addHistoryEntry,
    restoreFromHistory,
    getResourceHistory,
    resetToOriginal,
    formatYaml,
  } = useYamlEditorStore();

  const [showApplyConfirm, setShowApplyConfirm] = useState(false);

  const history = getResourceHistory();
  const hasChanges = originalContent !== editedContent;

  const editorTheme = useMemo(() => {
    return theme === "dark" ? "dark" : "light";
  }, [theme]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(editedContent);
    toast({
      title: "Copied",
      description: "YAML copied to clipboard.",
    });
  }, [editedContent, toast]);

  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    setValidationResult(null);

    try {
      const result = await invoke<ManifestResult>("validate_manifest", {
        manifest: editedContent,
        namespace: resourceKey?.namespace || currentNamespace || null,
      });
      setValidationResult(result);

      if (result.success) {
        toast({
          title: "Validation Passed",
          description: "Manifest is valid and can be applied.",
        });
      }
    } catch (error) {
      setValidationResult({
        success: false,
        stdout: "",
        stderr: String(error),
        exit_code: 1,
      });
    } finally {
      setIsValidating(false);
    }
  }, [
    editedContent,
    resourceKey,
    currentNamespace,
    setIsValidating,
    setValidationResult,
    toast,
  ]);

  const handleApply = useCallback(async () => {
    setShowApplyConfirm(false);
    setIsApplying(true);
    setApplyResult(null);

    try {
      const result = await invoke<ManifestResult>("apply_manifest", {
        manifest: editedContent,
        namespace: resourceKey?.namespace || currentNamespace || null,
      });
      setApplyResult(result);

      if (result.success) {
        // Save to history on successful apply
        addHistoryEntry(editedContent, "Applied");

        toast({
          title: "Applied Successfully",
          description: result.stdout || "Manifest applied to cluster.",
        });
      } else {
        toast({
          title: "Apply Failed",
          description: result.stderr || "Failed to apply manifest.",
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorResult = {
        success: false,
        stdout: "",
        stderr: String(error),
        exit_code: 1,
      };
      setApplyResult(errorResult);
      toast({
        title: "Apply Failed",
        description: String(error),
        variant: "destructive",
      });
    } finally {
      setIsApplying(false);
    }
  }, [
    editedContent,
    resourceKey,
    currentNamespace,
    setIsApplying,
    setApplyResult,
    addHistoryEntry,
    toast,
  ]);

  const handleFormat = useCallback(() => {
    formatYaml();
    toast({
      title: "Formatted",
      description: "YAML has been formatted.",
    });
  }, [formatYaml, toast]);

  const handleRestoreHistory = useCallback(
    (timestamp: number) => {
      restoreFromHistory(timestamp);
      toast({
        title: "Restored",
        description: "Content restored from history.",
      });
    },
    [restoreFromHistory, toast]
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && closeEditor()}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {title}
              {hasChanges && (
                <Badge variant="outline" className="ml-2">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Unsaved Changes
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Edit the YAML manifest and apply changes to the cluster
            </DialogDescription>
          </DialogHeader>

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-2 py-2 border-b">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFormat}
                    disabled={isLoading}
                  >
                    <AlignLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Format YAML</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    disabled={isLoading}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy to Clipboard</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetToOriginal}
                    disabled={isLoading || !hasChanges}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset to Original</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showDiff ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setShowDiff(!showDiff)}
                    disabled={isLoading}
                  >
                    <GitCompare className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle Diff View</TooltipContent>
              </Tooltip>

              {/* History Dropdown */}
              {history.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <History className="mr-2 h-4 w-4" />
                      History
                      <Badge variant="secondary" className="ml-2">
                        {history.length}
                      </Badge>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuLabel>Recent Changes</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {history.slice(0, 10).map((entry) => (
                      <DropdownMenuItem
                        key={entry.timestamp}
                        onClick={() => handleRestoreHistory(entry.timestamp)}
                      >
                        <div className="flex flex-col">
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                          {entry.label && (
                            <span className="text-sm">{entry.label}</span>
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidate}
                disabled={isLoading || isValidating || isApplying}
              >
                {isValidating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileCheck className="mr-2 h-4 w-4" />
                )}
                Validate
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={() => setShowApplyConfirm(true)}
                disabled={isLoading || isValidating || isApplying}
              >
                {isApplying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Apply
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : showDiff ? (
              <DiffViewer original={originalContent} modified={editedContent} />
            ) : (
              <div className="h-full rounded-md border overflow-hidden">
                <CodeMirror
                  value={editedContent}
                  height="100%"
                  theme={editorTheme}
                  extensions={[yamlLanguage(), EditorView.lineWrapping]}
                  onChange={(value) => setEditedContent(value)}
                  className="h-full"
                  basicSetup={{
                    lineNumbers: true,
                    highlightActiveLineGutter: true,
                    highlightActiveLine: true,
                    foldGutter: true,
                    autocompletion: true,
                    bracketMatching: true,
                    indentOnInput: true,
                  }}
                />
              </div>
            )}
          </div>

          {/* Results */}
          {(validationResult || applyResult) && (
            <div className="mt-2">
              <ResultDisplay result={applyResult || validationResult!} />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeEditor}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Confirmation Dialog */}
      <Dialog open={showApplyConfirm} onOpenChange={setShowApplyConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Changes?</DialogTitle>
            <DialogDescription>
              This will apply the manifest to your Kubernetes cluster. Make sure
              you have reviewed the changes.
            </DialogDescription>
          </DialogHeader>

          {hasChanges && (
            <div className="py-4">
              <p className="text-sm text-muted-foreground mb-2">
                Changes to be applied:
              </p>
              <ScrollArea className="h-[200px] rounded-md border">
                <DiffViewer
                  original={originalContent}
                  modified={editedContent}
                />
              </ScrollArea>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowApplyConfirm(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleApply}>
              <Play className="mr-2 h-4 w-4" />
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

