import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Hash, Type, List, Braces, ToggleLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SchemaViewerProps {
  schema: unknown;
  title?: string;
}

interface SchemaProperty {
  type?: string;
  description?: string;
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  required?: string[];
  enum?: string[];
  default?: unknown;
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | SchemaProperty;
  oneOf?: SchemaProperty[];
  anyOf?: SchemaProperty[];
  allOf?: SchemaProperty[];
  $ref?: string;
  "x-kubernetes-preserve-unknown-fields"?: boolean;
}

interface SchemaNodeProps {
  name: string;
  schema: SchemaProperty;
  required?: boolean;
  level: number;
  defaultExpanded?: boolean;
}

function getTypeIcon(type: string | undefined) {
  switch (type) {
    case "string":
      return <Type className="h-3 w-3" />;
    case "number":
    case "integer":
      return <Hash className="h-3 w-3" />;
    case "boolean":
      return <ToggleLeft className="h-3 w-3" />;
    case "array":
      return <List className="h-3 w-3" />;
    case "object":
      return <Braces className="h-3 w-3" />;
    default:
      return <Braces className="h-3 w-3" />;
  }
}

function getTypeColor(type: string | undefined): string {
  switch (type) {
    case "string":
      return "text-green-600 dark:text-green-400";
    case "number":
    case "integer":
      return "text-blue-600 dark:text-blue-400";
    case "boolean":
      return "text-purple-600 dark:text-purple-400";
    case "array":
      return "text-orange-600 dark:text-orange-400";
    case "object":
      return "text-cyan-600 dark:text-cyan-400";
    default:
      return "text-muted-foreground";
  }
}

function formatType(schema: SchemaProperty): string {
  if (schema.$ref) {
    return schema.$ref.split("/").pop() || "ref";
  }
  if (schema.oneOf) {
    return "oneOf";
  }
  if (schema.anyOf) {
    return "anyOf";
  }
  if (schema.type === "array" && schema.items) {
    return `array<${formatType(schema.items)}>`;
  }
  return schema.type || "unknown";
}

function SchemaNode({ name, schema, required, level, defaultExpanded = false }: SchemaNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || level < 2);

  const hasChildren = useMemo(() => {
    return (
      (schema.type === "object" && schema.properties && Object.keys(schema.properties).length > 0) ||
      (schema.type === "array" && schema.items?.properties) ||
      schema.oneOf ||
      schema.anyOf ||
      schema.allOf
    );
  }, [schema]);

  const childProperties = useMemo(() => {
    if (schema.type === "object" && schema.properties) {
      return Object.entries(schema.properties);
    }
    if (schema.type === "array" && schema.items?.properties) {
      return Object.entries(schema.items.properties);
    }
    return [];
  }, [schema]);

  const requiredFields = useMemo(() => {
    if (schema.type === "object") {
      return new Set(schema.required || []);
    }
    if (schema.type === "array" && schema.items) {
      return new Set(schema.items.required || []);
    }
    return new Set<string>();
  }, [schema]);

  return (
    <div className="font-mono text-sm">
      {/* Node header */}
      <div
        className={cn(
          "flex items-start gap-2 py-1 px-2 hover:bg-muted/50 rounded cursor-pointer",
          level > 0 && "ml-4"
        )}
        onClick={() => hasChildren && setExpanded(!expanded)}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {/* Expand/collapse icon */}
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : null}
        </span>

        {/* Type icon */}
        <span className={cn("flex-shrink-0 mt-0.5", getTypeColor(schema.type))}>
          {getTypeIcon(schema.type)}
        </span>

        {/* Property name */}
        <span className="font-semibold">{name}</span>

        {/* Required badge */}
        {required && (
          <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
            required
          </Badge>
        )}

        {/* Type */}
        <span className={cn("text-xs", getTypeColor(schema.type))}>
          {formatType(schema)}
        </span>

        {/* Format */}
        {schema.format && (
          <span className="text-xs text-muted-foreground">
            ({schema.format})
          </span>
        )}

        {/* Enum values */}
        {schema.enum && (
          <span className="text-xs text-muted-foreground">
            [{schema.enum.slice(0, 3).join(", ")}
            {schema.enum.length > 3 && "..."}]
          </span>
        )}

        {/* Default value */}
        {schema.default !== undefined && (
          <span className="text-xs text-muted-foreground">
            = {JSON.stringify(schema.default)}
          </span>
        )}
      </div>

      {/* Description */}
      {schema.description && (
        <div
          className="text-xs text-muted-foreground ml-8 mb-1"
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {schema.description}
        </div>
      )}

      {/* Constraints */}
      {(schema.minimum !== undefined ||
        schema.maximum !== undefined ||
        schema.minLength !== undefined ||
        schema.maxLength !== undefined ||
        schema.pattern) && (
        <div
          className="text-xs text-muted-foreground ml-8 mb-1 flex gap-2"
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {schema.minimum !== undefined && <span>min: {schema.minimum}</span>}
          {schema.maximum !== undefined && <span>max: {schema.maximum}</span>}
          {schema.minLength !== undefined && <span>minLength: {schema.minLength}</span>}
          {schema.maxLength !== undefined && <span>maxLength: {schema.maxLength}</span>}
          {schema.pattern && <span>pattern: /{schema.pattern}/</span>}
        </div>
      )}

      {/* Children */}
      {expanded && hasChildren && (
        <div className="border-l border-border ml-4" style={{ marginLeft: `${level * 16 + 16}px` }}>
          {/* Object properties */}
          {childProperties.map(([propName, propSchema]) => (
            <SchemaNode
              key={propName}
              name={propName}
              schema={propSchema}
              required={requiredFields.has(propName)}
              level={level + 1}
            />
          ))}

          {/* oneOf / anyOf / allOf */}
          {(schema.oneOf || schema.anyOf || schema.allOf)?.map((subSchema, i) => (
            <SchemaNode
              key={i}
              name={`option ${i + 1}`}
              schema={subSchema}
              level={level + 1}
            />
          ))}

          {/* Additional properties */}
          {schema.additionalProperties === true && (
            <div
              className="text-xs text-muted-foreground py-1"
              style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
            >
              (additional properties allowed)
            </div>
          )}
          {typeof schema.additionalProperties === "object" && (
            <SchemaNode
              name="[additionalProperties]"
              schema={schema.additionalProperties}
              level={level + 1}
            />
          )}

          {/* x-kubernetes-preserve-unknown-fields */}
          {schema["x-kubernetes-preserve-unknown-fields"] && (
            <div
              className="text-xs text-muted-foreground py-1"
              style={{ paddingLeft: `${(level + 1) * 16 + 8}px` }}
            >
              (preserves unknown fields)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SchemaViewer({ schema, title }: SchemaViewerProps) {
  const parsedSchema = schema as SchemaProperty;

  if (!parsedSchema || typeof parsedSchema !== "object") {
    return (
      <div className="text-muted-foreground text-sm">
        No schema information available.
      </div>
    );
  }

  // Get the spec schema if available (common for CRDs)
  const specSchema = parsedSchema.properties?.spec as SchemaProperty | undefined;
  const statusSchema = parsedSchema.properties?.status as SchemaProperty | undefined;

  return (
    <div className="space-y-4">
      {title && <h3 className="font-semibold text-lg">{title}</h3>}

      <div className="border rounded-lg overflow-hidden bg-card">
        {/* Spec section */}
        {specSchema && (
          <div className="border-b last:border-b-0">
            <div className="bg-muted/50 px-3 py-2 font-semibold text-sm">
              spec
            </div>
            <div className="p-2">
              {specSchema.properties ? (
                Object.entries(specSchema.properties).map(([name, propSchema]) => (
                  <SchemaNode
                    key={name}
                    name={name}
                    schema={propSchema}
                    required={specSchema.required?.includes(name)}
                    level={0}
                    defaultExpanded={true}
                  />
                ))
              ) : (
                <SchemaNode
                  name="spec"
                  schema={specSchema}
                  level={0}
                  defaultExpanded={true}
                />
              )}
            </div>
          </div>
        )}

        {/* Status section */}
        {statusSchema && (
          <div className="border-b last:border-b-0">
            <div className="bg-muted/50 px-3 py-2 font-semibold text-sm">
              status
            </div>
            <div className="p-2">
              {statusSchema.properties ? (
                Object.entries(statusSchema.properties).map(([name, propSchema]) => (
                  <SchemaNode
                    key={name}
                    name={name}
                    schema={propSchema}
                    required={statusSchema.required?.includes(name)}
                    level={0}
                  />
                ))
              ) : (
                <SchemaNode
                  name="status"
                  schema={statusSchema}
                  level={0}
                />
              )}
            </div>
          </div>
        )}

        {/* If no spec/status, show root properties */}
        {!specSchema && !statusSchema && parsedSchema.properties && (
          <div className="p-2">
            {Object.entries(parsedSchema.properties).map(([name, propSchema]) => (
              <SchemaNode
                key={name}
                name={name}
                schema={propSchema as SchemaProperty}
                required={parsedSchema.required?.includes(name)}
                level={0}
                defaultExpanded={true}
              />
            ))}
          </div>
        )}

        {/* Fallback for simple schemas */}
        {!parsedSchema.properties && (
          <div className="p-2">
            <SchemaNode
              name="root"
              schema={parsedSchema}
              level={0}
              defaultExpanded={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
