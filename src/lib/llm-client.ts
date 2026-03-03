import OpenAI from "openai"

export type LlmProvider = "openai" | "openrouter"

export interface LlmConfig {
    model: string
    apiKey?: string
    provider?: LlmProvider
}

/**
 * Derives the provider from the model string if not explicitly set.
 * Models prefixed with "openrouter/" are automatically routed to OpenRouter.
 */
export function deriveProvider(model: string): LlmProvider {
    return model.startsWith("openrouter/") ? "openrouter" : "openai"
}

/**
 * Strips the provider prefix from the model string if present.
 * e.g. "openrouter/anthropic/claude-3.5-sonnet" → "anthropic/claude-3.5-sonnet"
 */
export function resolveModelName(model: string): string {
    return model.replace(/^openrouter\//, "")
}

/**
 * Returns the API base URL for the given provider.
 */
export function resolveBaseUrl(provider: LlmProvider): string | undefined {
    if (provider === "openrouter") return "https://openrouter.ai/api/v1"
    return undefined
}

/**
 * Returns the correct environment-level API key fallback for the given provider.
 */
export function resolveEnvApiKey(provider: LlmProvider): string | undefined {
    if (provider === "openrouter") return process.env.OPENROUTER_API_KEY
    return process.env.OPENAI_API_KEY
}

/**
 * Builds and returns an OpenAI-compatible client for the given LLM configuration.
 *
 * Resolution priority for apiKey:
 *   1. Explicitly provided `apiKey` argument
 *   2. `OPENROUTER_API_KEY` env var (if provider is openrouter)
 *   3. `OPENAI_API_KEY` env var (if provider is openai)
 *
 * @param config - LLM model, optional apiKey, optional explicit provider
 * @param timeoutMs - Request timeout in milliseconds (default: 120s)
 */
export function createLlmClient(config: LlmConfig, timeoutMs = 120_000): {
    client: OpenAI
    model: string
} {
    const provider = config.provider ?? deriveProvider(config.model)
    const model = resolveModelName(config.model)
    const baseURL = resolveBaseUrl(provider)
    const apiKey = config.apiKey || resolveEnvApiKey(provider)

    const client = new OpenAI({ apiKey, baseURL, timeout: timeoutMs })
    return { client, model }
}

/**
 * Merges a project's saved llmConfig with optional inline overrides.
 * Inline values from the request always take precedence over the project's saved config.
 *
 * @param projectLlmConfigJson - Raw JSON string from the database (project.llmConfig)
 * @param inline - Optional inline overrides from user request (model, apiKey)
 */
export function resolveLlmConfig(
    projectLlmConfigJson: string | null,
    inline?: { model?: string; apiKey?: string }
): LlmConfig {
    // Defaults
    let model = "gpt-4-turbo"
    let apiKey: string | undefined = undefined

    // Layer 1: project DB config
    if (projectLlmConfigJson) {
        try {
            const saved = JSON.parse(projectLlmConfigJson)
            if (saved.model) model = saved.model
            if (saved.apiKey) apiKey = saved.apiKey
        } catch { /* ignore corrupt config */ }
    }

    // Layer 2: inline request override (always wins if present)
    if (inline?.model) model = inline.model
    if (inline?.apiKey) apiKey = inline.apiKey

    return { model, apiKey, provider: deriveProvider(model) }
}
