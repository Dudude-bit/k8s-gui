// src/components/resources/ReferencedBy.tsx
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Layers, Lock, FileKey, HardDrive, Globe, Image } from "lucide-react";
import { useState } from "react";
import { ResourceLink } from "@/components/shared";
import { commands } from "@/lib/commands";
import type { ResourceReferences } from "@/generated/types";

interface ReferencedByProps {
  resourceType: "Secret" | "ConfigMap";
  name: string;
  namespace: string;
}

interface SectionProps {
  title: string;
  icon: React.ElementType;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, icon: Icon, count, defaultOpen = false, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen || count > 0);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 hover:bg-muted/50 rounded-md transition-colors">
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">{title}</span>
        <Badge variant={count > 0 ? "default" : "secondary"} className="ml-auto">
          {count}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-8 pr-2 pb-2 space-y-2">
        {count === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No references found</p>
        ) : (
          children
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ReferencedBy({ resourceType, name, namespace }: ReferencedByProps) {
  const { data, isLoading, error } = useQuery<ResourceReferences>({
    queryKey: ["resourceReferences", resourceType, name, namespace],
    queryFn: () => commands.getResourceReferences(resourceType, name, namespace),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6" />
          <span className="ml-2 text-muted-foreground">Loading references...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-destructive text-sm">Failed to load references: {String(error)}</p>
        </CardContent>
      </Card>
    );
  }

  const refs = data || { envVars: [], envFrom: [], volumes: [], imagePullSecrets: [], tlsIngress: [] };
  const totalCount = refs.envVars.length + refs.envFrom.length + refs.volumes.length +
                     refs.imagePullSecrets.length + refs.tlsIngress.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Referenced By
          <Badge variant="secondary" className="ml-2">{totalCount}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <Section
          title="Environment Variables"
          icon={resourceType === "Secret" ? Lock : FileKey}
          count={refs.envVars.length}
          defaultOpen={refs.envVars.length > 0}
        >
          {refs.envVars.map((ref, i) => (
            <ResourceLink
              key={`env-${i}`}
              kind={ref.kind}
              name={ref.name}
              namespace={ref.namespace}
              subtitle={ref.containerName ? `Container: ${ref.containerName}${ref.key ? ` → ${ref.key}` : ""}` : undefined}
            />
          ))}
        </Section>

        <Section
          title="EnvFrom (Bulk Import)"
          icon={resourceType === "Secret" ? Lock : FileKey}
          count={refs.envFrom.length}
          defaultOpen={refs.envFrom.length > 0}
        >
          {refs.envFrom.map((ref, i) => (
            <ResourceLink
              key={`envfrom-${i}`}
              kind={ref.kind}
              name={ref.name}
              namespace={ref.namespace}
              subtitle={ref.containerName ? `Container: ${ref.containerName} (all keys)` : undefined}
            />
          ))}
        </Section>

        <Section
          title="Volume Mounts"
          icon={HardDrive}
          count={refs.volumes.length}
          defaultOpen={refs.volumes.length > 0}
        >
          {refs.volumes.map((ref, i) => (
            <ResourceLink
              key={`vol-${i}`}
              kind={ref.kind}
              name={ref.name}
              namespace={ref.namespace}
              subtitle={`${ref.containerName ? `${ref.containerName} → ` : ""}${ref.mountPath}`}
            />
          ))}
        </Section>

        {resourceType === "Secret" && (
          <>
            <Section
              title="Image Pull Secrets"
              icon={Image}
              count={refs.imagePullSecrets.length}
            >
              {refs.imagePullSecrets.map((ref, i) => (
                <ResourceLink
                  key={`pull-${i}`}
                  kind={ref.kind}
                  name={ref.name}
                  namespace={ref.namespace}
                />
              ))}
            </Section>

            <Section
              title="TLS Ingress"
              icon={Globe}
              count={refs.tlsIngress.length}
            >
              {refs.tlsIngress.map((ref, i) => (
                <ResourceLink
                  key={`tls-${i}`}
                  kind="Ingress"
                  name={ref.name}
                  namespace={ref.namespace}
                  subtitle={ref.hosts.length > 0 ? `Hosts: ${ref.hosts.join(", ")}` : undefined}
                />
              ))}
            </Section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
