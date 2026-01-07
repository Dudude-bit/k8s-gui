import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextSkeleton } from "@/components/ui/skeleton";
import { YamlEditor, YamlEditorAction } from "@/components/yaml";
import { fetchResourceYaml } from "@/hooks/useResourceYaml";
import { Copy } from "lucide-react";
import { useCallback } from "react";

interface YamlTabContentProps {
  title: string;
  yaml: string | undefined;
  resourceKind: string;
  resourceName: string;
  namespace: string | undefined;
  onCopy: () => void;
}

export function YamlTabContent({
  title,
  yaml,
  resourceKind,
  resourceName,
  namespace,
  onCopy,
}: YamlTabContentProps) {
  const isYamlLoading = yaml == null;

  const handleFetchYaml = useCallback(() => {
    return fetchResourceYaml(resourceKind, resourceName, namespace);
  }, [resourceKind, resourceName, namespace]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <div className="flex items-center gap-2">
          <YamlEditorAction
            title={`Edit ${resourceKind}: ${resourceName}`}
            resourceKey={{
              kind: resourceKind,
              name: resourceName,
              namespace: namespace,
            }}
            fetchYaml={handleFetchYaml}
          />
          <Button variant="outline" size="sm" onClick={onCopy}>
            <Copy className="mr-2 h-4 w-4" />
            Copy
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isYamlLoading ? (
          <div className="rounded-md border bg-muted/40 p-4">
            <TextSkeleton lines={18} />
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <YamlEditor value={yaml} readOnly height="500px" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
