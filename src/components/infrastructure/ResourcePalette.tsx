import { ResourceKind } from "@/features/infrastructure/types";
import { Button } from "@/components/ui/button";

interface ResourcePaletteProps {
  onAdd: (kind: ResourceKind) => void;
  onTemplate: (templateId: string) => void;
  onPointerDown: (
    event: React.PointerEvent<HTMLDivElement>,
    kind: ResourceKind
  ) => void;
}

const RESOURCE_ITEMS: Array<{ kind: ResourceKind; description: string }> = [
  { kind: "Pod", description: "Single container workload" },
  { kind: "Deployment", description: "Replicated workload" },
  { kind: "Service", description: "Stable network endpoint" },
  { kind: "Ingress", description: "HTTP routing rules" },
  { kind: "ConfigMap", description: "Configuration data" },
  { kind: "Secret", description: "Sensitive data" },
];

const TEMPLATE_ITEMS = [
  {
    id: "web-service",
    label: "Web Service",
    description: "Deployment + Service + Ingress",
  },
  {
    id: "config-backed-app",
    label: "Config-backed App",
    description: "ConfigMap + Deployment + Service",
  },
];

export function ResourcePalette({
  onAdd,
  onTemplate,
  onPointerDown,
}: ResourcePaletteProps) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <div className="text-sm font-semibold">Resources</div>
        <div className="mt-3 space-y-2">
          {RESOURCE_ITEMS.map((item) => (
            <div
              key={item.kind}
              role="button"
              tabIndex={0}
              onPointerDown={(event) => onPointerDown(event, item.kind)}
              onClick={() => onAdd(item.kind)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onAdd(item.kind);
                }
              }}
              className="w-full cursor-grab select-none touch-none rounded-md border border-border bg-background px-3 py-2 text-left text-xs transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{item.kind}</span>
                <span className="text-[11px] text-muted-foreground">Drag</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {item.description}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold">Templates</div>
        <div className="mt-3 space-y-2">
          {TEMPLATE_ITEMS.map((item) => (
            <Button
              key={item.id}
              variant="outline"
              size="sm"
              className="h-auto w-full justify-start px-3 py-2 text-left"
              onClick={() => onTemplate(item.id)}
            >
              <div>
                <div className="text-xs font-semibold">{item.label}</div>
                <div className="text-[11px] text-muted-foreground">
                  {item.description}
                </div>
              </div>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
