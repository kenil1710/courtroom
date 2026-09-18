import Link from "next/link";
import { Shell, Empty } from "@/components/ui";

/*
 * This route deliberately has NO `loading.tsx`, and every other route has one.
 *
 * A route-level loading file puts the page behind a Suspense boundary, which
 * makes Next stream the response — and once streaming has begun the status line
 * has already gone out as 200, so `notFound()` can no longer set a 404. Measured
 * both ways: with the file, /case/999 answers 200; without it, 404.
 *
 * A case is the one shareable, linkable resource on this site. Serving 200 for
 * one that does not exist would lie to anything that reads status codes, which
 * is worth more than a spinner on a page that renders in well under a second.
 * The spinner stays on /cases, /verdicts, /file and /docs, none of which can
 * 404.
 */

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
