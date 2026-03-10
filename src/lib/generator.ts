import { prisma } from "@/lib/prisma";
import { createLlmClient, resolveLlmConfig } from "@/lib/llm-client";
import { buildGenerationPrompts } from "@/lib/generation-prompt-builder";
import { GeneratedProjectWriter } from "@/lib/generated-project-writer";

export class GeneratorService {
  private readonly projectId: string;
  private readonly model: string;
  private readonly apiKey?: string;

  constructor(projectId: string, apiKey?: string, model: string = "gpt-4-turbo") {
    this.projectId = projectId;
    this.model = model;
    this.apiKey = apiKey;
  }

  async generate() {
    const project = await prisma.project.findUnique({
      where: { id: this.projectId },
      include: { enrichments: true },
    });

    if (!project || !project.openApiSpec) {
      throw new Error("Project or OpenAPI spec not found");
    }

    const spec = JSON.parse(project.openApiSpec);

    const { systemPrompt, userPrompt } = buildGenerationPrompts(project, spec);

    try {
      const { client, model } = createLlmClient(
        resolveLlmConfig(null, { model: this.model, apiKey: this.apiKey }),
        240_000
      );
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2, // Low temp for code
      });

      const generatedText = completion.choices[0].message.content || "";
      const writer = new GeneratedProjectWriter({ projectId: this.projectId });
      await writer.writeFromLlmOutput(generatedText, project);

      return { success: true, message: "Generation complete" };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("LLM Generation Error:", error);
      throw error;
    }
  }
}
