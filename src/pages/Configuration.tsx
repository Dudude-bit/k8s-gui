import { Routes, Route } from "react-router-dom";
import { ResourceType, toPlural } from "@/lib/resource-types";
import { ConfigMapList } from "@/components/resources/ConfigMapList";
import { SecretList } from "@/components/resources/SecretList";
import { InfrastructureBuilder } from "@/pages/InfrastructureBuilder";

export function Configuration() {
  return (
    <Routes>
      <Route path={toPlural(ResourceType.ConfigMap)} element={<ConfigMapList />} />
      <Route path={toPlural(ResourceType.Secret)} element={<SecretList />} />
      <Route path="builder" element={<InfrastructureBuilder />} />
      <Route index element={<ConfigMapList />} />
    </Routes>
  );
}
