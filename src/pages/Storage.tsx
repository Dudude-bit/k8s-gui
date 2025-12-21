import { Routes, Route } from "react-router-dom";
import { PersistentVolumeList } from "@/components/resources/PersistentVolumeList";
import { PersistentVolumeClaimList } from "@/components/resources/PersistentVolumeClaimList";
import { StorageClassList } from "@/components/resources/StorageClassList";

export function Storage() {
  return (
    <Routes>
      <Route path="pvs" element={<PersistentVolumeList />} />
      <Route path="pvcs" element={<PersistentVolumeClaimList />} />
      <Route path="classes" element={<StorageClassList />} />
      <Route index element={<PersistentVolumeList />} />
    </Routes>
  );
}
