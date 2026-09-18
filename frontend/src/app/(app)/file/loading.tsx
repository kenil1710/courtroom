import { LoadingPanel } from "@/components/scales";
import { Shell } from "@/components/ui";

export default function Loading() {
  return (
    <Shell>
      <LoadingPanel what="Reading the court…" />
    </Shell>
  );
}
