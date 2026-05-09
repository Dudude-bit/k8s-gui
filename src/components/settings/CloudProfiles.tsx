import { useState } from "react";
import { ChevronDown, ChevronRight, Cloud, Link } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AzureProfilesSection } from "./cloud/AzureProfilesSection";
import { BindingsTab } from "./cloud/BindingsTab";
import { GcpProfilesSection } from "./cloud/GcpProfilesSection";

export function CloudProfiles() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger className="flex items-center gap-2 hover:opacity-80 w-full">
            <div className="flex items-center gap-2 flex-1">
              {isOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <Cloud className="h-5 w-5" />
              <CardTitle className="text-lg">Cloud Profiles</CardTitle>
            </div>
          </CollapsibleTrigger>
          <CardDescription className="ml-11">
            Manage GCP and Azure authentication profiles, and bind them to
            kubeconfig contexts
          </CardDescription>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <Tabs defaultValue="profiles" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="profiles">
                  <Cloud className="h-4 w-4 mr-2" />
                  Profiles
                </TabsTrigger>
                <TabsTrigger value="bindings">
                  <Link className="h-4 w-4 mr-2" />
                  Context Bindings
                </TabsTrigger>
              </TabsList>
              <TabsContent value="profiles" className="mt-4">
                <div className="space-y-6">
                  <GcpProfilesSection />
                  <Separator />
                  <AzureProfilesSection />
                </div>
              </TabsContent>
              <TabsContent value="bindings" className="mt-4">
                <BindingsTab />
              </TabsContent>
            </Tabs>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
