import Link from "next/link";
import { Shell, Empty } from "@/components/ui";

export default function CaseNotFound() {
  return (
    <Shell>
      <Empty
        title="No case with that number"
        body="Case numbers start at 1 and run without gaps. Check the docket for the one you meant."
        action={<Link href="/cases" className="btn btn-primary">Open the docket</Link>}
      />
    </Shell>
  );
}
