import { redTeamPrompt } from "@/lib/prompts";
import { runDeepTool } from "@/app/api/analyses/deepTool";

export const maxDuration = 300;

// Red team: attack the investment (10 brutal, specific failure modes), judge
// which are actually likely, and end with an honest Proceed / Stay away call.
export async function POST(req: Request) {
  return runDeepTool(req, {
    key: "redteam",
    system: redTeamPrompt,
    question: (asset, assetClass) => `Asset: ${asset}\nAsset class: ${assetClass}\n\nI'm about to invest. Attack it — worst case, 10 reasons I lose my money, then your honest verdict.`,
    maxTokens: 1400,
    failure: "Couldn't run the red team",
  });
}
