'use client'

import { saveLlmConfig } from '@/app/actions/config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

const initialState: any = {
    message: '',
    errors: {},
}

export function LlmConfigForm({ projectId, initialConfig }: { projectId: string; initialConfig?: any }) {
    const [state, dispatch] = useActionState(saveLlmConfig.bind(null, projectId), initialState)

    return (
        <form action={dispatch} className="grid gap-4">
            <div className="grid gap-2">
                <Label htmlFor="model">Model</Label>
                <Select name="model" defaultValue={initialConfig?.model || "gpt-4-turbo"}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                        <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                        <SelectItem value="claude-3-opus">Claude 3 Opus (via Proxy)</SelectItem>
                        <SelectItem value="claude-3-sonnet">Claude 3.5 Sonnet (via Proxy)</SelectItem>
                        <SelectItem value="openrouter/anthropic/claude-3.5-sonnet">OpenRouter: Claude 3.5 Sonnet</SelectItem>
                        <SelectItem value="openrouter/meta-llama/llama-3.1-70b-instruct">OpenRouter: LLaMA 3.1 70B</SelectItem>
                        <SelectItem value="openrouter/google/gemini-pro-1.5">OpenRouter: Gemini 1.5 Pro</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="grid gap-2">
                <Label htmlFor="apiKey">API Key (Optional)</Label>
                <Input
                    id="apiKey"
                    name="apiKey"
                    type="password"
                    placeholder="sk-..."
                    defaultValue={initialConfig?.apiKey || ''}
                />
                <p className="text-xs text-muted-foreground">Leave empty to use system default (if configured).</p>
            </div>

            <div className="flex items-center justify-between">
                <div aria-live="polite" aria-atomic="true">
                    {state?.message && (
                        <p className={`text-sm ${state.success ? 'text-green-500' : 'text-red-500'}`}>{state.message}</p>
                    )}
                </div>
                <SubmitButton />
            </div>
        </form>
    )
}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : 'Save Configuration'}
        </Button>
    )
}
