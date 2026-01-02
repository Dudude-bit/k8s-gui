import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { CommandPalette } from "./CommandPalette";
import { YamlViewerDialog } from "@/components/ui/yaml-viewer";
import { YamlEditorDialog } from "@/components/ui/yaml-editor";
import { PageSkeleton } from "@/components/ui/skeleton";

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto scrollbar-thin p-4">
          <div className="animate-in fade-in duration-200">
            <Suspense fallback={<PageSkeleton className="p-0" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <CommandPalette />
      <YamlViewerDialog />
      <YamlEditorDialog />
    </div>
  );
}
