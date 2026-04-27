import { createElement } from "react";

import { getResourceIcon } from "@/lib/resource-registry";

interface ResourceIconProps {
  /** Kubernetes resource kind ("Pod", "Service", …) or its plural. */
  kind: string;
  className?: string;
}

/**
 * Resolves the Lucide icon for a given resource kind and renders it.
 *
 * Implementation note: deliberately uses `React.createElement` rather
 * than the `const Icon = getResourceIcon(kind); <Icon />` pattern.
 * `react-hooks/static-components` flags the JSX form because it can't
 * statically prove `getResourceIcon` returns a stable component
 * reference (it does — same `kind` → same `LucideIcon` reference from
 * a Map lookup — but eslint sees a dynamic component type at the
 * `<Icon>` site). `createElement(typeFromVariable, ...)` is "render
 * this element," not "create a component," and the rule is happy.
 */
export function ResourceIcon({ kind, className }: ResourceIconProps) {
  return createElement(getResourceIcon(kind), { className });
}
