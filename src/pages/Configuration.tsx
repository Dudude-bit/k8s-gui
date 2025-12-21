import { Routes, Route } from "react-router-dom";
import { ConfigMapList } from "@/components/resources/ConfigMapList";
import { SecretList } from "@/components/resources/SecretList";
import { InfrastructureBuilder } from "@/pages/InfrastructureBuilder";

export function Configuration() {
  return (
    <Routes>
      <Route path="configmaps" element={<ConfigMapList />} />
      <Route path="secrets" element={<SecretList />} />
      <Route path="builder" element={<InfrastructureBuilder />} />
      <Route index element={<ConfigMapList />} />
    </Routes>
  );
}
