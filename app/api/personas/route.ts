import { personasPrompt } from "@/lib/prompts";
import { runDeepTool } from "@/app/api/analyses/deepTool";

export const maxDuration = 300;

// Stylized investor takes for the analyzed asset (Buffett/Graham/Lynch/Burry
// disciplines — not the people themselves).
export async function POST(req: Request) {
  return runDeepTool(req, {
    key: "personas",
    system: personasPrompt,
    question: (asset, assetClass) => `Asset: ${asset}\nAsset class: ${assetClass}\n\nGive the four stylized investor takes using current public information.`,
    maxTokens: 1100,
    failure: "Couldn't get the investor takes",
  });
}
