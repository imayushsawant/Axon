export type BlastRadius = "Low" | "Medium" | "High";
export type ReasoningDepth = "Low" | "Medium" | "High";
export type Ambiguity = "Clear" | "Unclear";

export type RubricRating = {
  blastRadius: BlastRadius;
  irreversible: boolean;
  reasoningDepth: ReasoningDepth;
  ambiguity: Ambiguity;
};

export async function ratePrompt(_prompt: string): Promise<RubricRating> {
  throw new Error("Judge rubric rating is not implemented yet");
}
