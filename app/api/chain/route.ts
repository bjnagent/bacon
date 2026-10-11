import { chainMapPrompt } from "@/lib/prompts";
import { runDeepTool } from "@/app/api/analyses/deepTool";

export const maxDuration = 300;

// Chain map: second/third-degree winners & losers around an industry, trend or
// asset — 10 non-obvious names, signal-checked, with the 2-3 real setups called.
export async function POST(req: Request) {
  return runDeepTool(req, {
    key: "chain",
    system: chainMapPrompt,
    question: (asset, assetClass) => `Industry / trend / asset: ${asset}${assetClass ? ` (${assetClass})` : ""}\n\nMap the second- and third-degree winners and losers, give me the names I wouldn't think of, and call the real setups.`,
    maxTokens: 1600,
    failure: "Couldn't map the chain",
  });
}
