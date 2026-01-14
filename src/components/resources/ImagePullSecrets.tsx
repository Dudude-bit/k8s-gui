// src/components/resources/ImagePullSecrets.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

interface ImagePullSecretsProps {
  secrets: string[];
  namespace?: string;
}

export function ImagePullSecrets({ secrets, namespace }: ImagePullSecretsProps) {
  const [isExpanded, setIsExpanded] = useState(secrets.length > 0);

  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <CardTitle className="text-base">
              Image Pull Secrets
              <Badge variant="secondary" className="ml-2">{secrets.length}</Badge>
            </CardTitle>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {secrets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No image pull secrets configured</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {secrets.map((secretName) => (
                  <Link
                    key={secretName}
                    to={namespace ? `/configuration/secrets/${namespace}/${secretName}` : "#"}
                    className="flex items-center gap-2 text-sm border rounded-md px-3 py-1.5 bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <Lock className="h-3 w-3 text-orange-500" />
                    <span className="font-mono text-xs">{secretName}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
