import { debatePrompt } from "@/lib/prompts";
import { runDeepTool } from "@/app/api/analyses/deepTool";

export const maxDuration = 300;

// Bull vs Bear: steelman both sides from current sources, then pick the winner.
export async function POST(req: Request) {
  return runDeepTool(req, {
    key: "debate",
    system: debatePrompt,
    question: (asset, assetClass) => `Asset: ${asset}\nAsset class: ${assetClass}\n\nRun the bull-vs-bear debate using current public information.`,
    maxTokens: 1100,
    failure: "Couldn't run the debate",
  });
}
