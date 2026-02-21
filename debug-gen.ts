import { prisma } from "./src/lib/prisma"
import { GeneratorService } from "./src/lib/generator"

async function debugGen() {
    const project = await prisma.project.findFirst({
        orderBy: { createdAt: 'desc' }
    });

    if (!project) {
        console.log("No project found");
        return;
    }

    console.log(`Debugging project: ${project.id} - ${project.name}`);

    let apiKey = undefined;
    if (project.llmConfig) {
        const config = JSON.parse(project.llmConfig);
        if (config.apiKey) apiKey = config.apiKey;
    }

    console.log(`API Key extracted: ${apiKey ? "Yes (hidden)" : "No"}`);

    try {
        const generator = new GeneratorService(project.id, apiKey);
        console.log("Generator instantiated.");

        await generator.generate();
        console.log("Generation successful.");
    } catch (e: any) {
        console.error("DEBUG ERROR CAUGHT:");
        console.error(e.message);
        if (e.response) {
            console.error(e.response.data);
        }
        console.error(e);
    }
}

debugGen().catch(console.error);
