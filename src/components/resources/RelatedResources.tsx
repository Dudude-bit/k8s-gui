/**
 * Related Resources Component
 *
 * Displays owner references as clickable links to parent resources.
 * Shows the chain of ownership for a Kubernetes resource.
 */

import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers } from "lucide-react";
import { getResourceIcon } from "@/lib/resource-registry";
import { getResourceDetailUrl } from "@/lib/navigation-utils";
import type { OwnerReferenceInfo } from "@/generated/types";

interface RelatedResourcesProps {
  ownerReferences: OwnerReferenceInfo[];
  namespace?: string;
}

export function RelatedResources({ ownerReferences, namespace }: RelatedResourcesProps) {
  if (!ownerReferences || ownerReferences.length === 0) {
    return null;
  }

  // Find controller owner (the primary owner)
  const controllerOwner = ownerReferences.find((ref) => ref.controller);
  const otherOwners = ownerReferences.filter((ref) => !ref.controller);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Related Resources
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Controller owner (primary) */}
        {controllerOwner && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">
              Controlled by
            </div>
            <OwnerLink owner={controllerOwner} namespace={namespace} />
          </div>
        )}

        {/* Other owners */}
        {otherOwners.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground font-medium">
              Other owners
            </div>
            <div className="space-y-2">
              {otherOwners.map((owner) => (
                <OwnerLink
                  key={owner.uid}
                  owner={owner}
                  namespace={namespace}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface OwnerLinkProps {
  owner: OwnerReferenceInfo;
  namespace?: string;
}

function OwnerLink({ owner, namespace }: OwnerLinkProps) {
  const Icon = getResourceIcon(owner.kind);
  const path = getResourceDetailUrl(owner.kind, owner.name, namespace);

  return (
    <Link to={path} className="block">
      <div className="flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent transition-colors">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{owner.name}</span>
        <Badge variant="outline" className="ml-auto text-xs">
          {owner.kind}
        </Badge>
      </div>
    </Link>
  );
}
