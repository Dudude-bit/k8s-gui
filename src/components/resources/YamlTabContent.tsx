import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { YamlEditorAction } from "@/components/ui/yaml-editor";
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
        <ScrollArea className="h-[500px]">
          <pre className="text-xs font-mono bg-muted p-4 rounded-md overflow-x-auto">
            {yaml || "Loading..."}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

