import type { Metadata } from "next";
import { getConfig } from "@/lib/court";
import { FileForm } from "@/components/file-form";
import { Shell, Notice } from "@/components/ui";

export const metadata: Metadata = {
  title: "File a case",
  description: "File a small claim against a wallet address and put your evidence on the record.",
};

export const revalidate = 60;

export default async function FilePage() {
  let config = null;
  try {
    config = await getConfig();
  } catch {
    config = null;
  }

  return (
    <Shell>
      <header className="mb-7">
        <h1 className="display h2">File a case</h1>
        <p className="lede mt-2">
          Put your side on the record. Once you file, the defendant has a fixed
          window to answer and bond the amount you are claiming.
        </p>
      </header>

      {config ? (
        <FileForm config={config} />
      ) : (
        <Notice tone="bad" title="The court is not answering">
          We could not read the filing fee and limits from the contract, so this
          form cannot be shown safely. This is usually the testnet RPC being
          busy — reload in a moment.
        </Notice>
      )}
    </Shell>
  );
}
