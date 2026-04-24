import { CheckCircle2, XCircle } from "lucide-react";
import type { ManifestResult } from "@/generated/types";

export interface YamlResultDisplayProps {
  result: ManifestResult;
}

export function YamlResultDisplay({ result }: YamlResultDisplayProps) {
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
