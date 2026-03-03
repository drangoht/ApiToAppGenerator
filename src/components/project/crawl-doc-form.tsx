'use client'

import { crawlApiDocumentation } from '@/app/actions/crawl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTransition, useState } from 'react'
import { Globe } from 'lucide-react'

export function CrawlDocForm({ projectId }: { projectId: string }) {
    const [isPending, startTransition] = useTransition()
    const [message, setMessage] = useState<string>('')

    async function handleSubmit(formData: FormData) {
        const url = formData.get('url') as string
        const model = formData.get('model') as string
        const apiKey = formData.get('apiKey') as string

        if (!url) return;

        startTransition(async () => {
            const result = await crawlApiDocumentation(projectId, url, { model, apiKey })
            if (result?.message) {
                setMessage(result.message)
            }
        })
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Crawl Documentation
                </CardTitle>
                <CardDescription>
                    Provide a URL to the API documentation. We will scrape and convert it to OpenAPI.
                </CardDescription>
            </CardHeader>
            <form action={handleSubmit}>
                <CardContent>
                    <div className="grid w-full items-center gap-4">
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="url">Documentation URL</Label>
                            <Input
                                id="url"
                                name="url"
                                type="url"
                                placeholder="https://api.example.com/docs"
                                required
                            />
                        </div>

                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="model">AI Model for Parsing</Label>
                            <Select name="model" defaultValue="gpt-4-turbo">
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a model" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                                    <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                                    <SelectItem value="claude-3-opus">Claude 3 Opus (via Proxy)</SelectItem>
                                    <SelectItem value="claude-3-sonnet">Claude 3.5 Sonnet (via Proxy)</SelectItem>
                                    <SelectItem value="openrouter/anthropic/claude-3.5-sonnet">OpenRouter: Claude 3.5 Sonnet</SelectItem>
                                    <SelectItem value="openrouter/meta-llama/llama-3.1-70b-instruct">OpenRouter: LLaMA 3.1 70B</SelectItem>
                                    <SelectItem value="openrouter/google/gemini-pro-1.5">OpenRouter: Gemini 1.5 Pro</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="apiKey">API Key (Optional)</Label>
                            <Input
                                id="apiKey"
                                name="apiKey"
                                type="password"
                                placeholder="sk-..."
                            />
                            <p className="text-xs text-muted-foreground mt-1">Leave empty to use project/system default.</p>
                        </div>
                        <div className="flex h-8 items-end space-x-1" aria-live="polite" aria-atomic="true">
                            {message && (
                                <p className={`text-sm ${message === 'Success' ? 'text-green-500' : 'text-red-500'}`}>{message}</p>
                            )}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                    <Button type="submit" disabled={isPending}>
                        {isPending ? 'Crawling & Analyzing...' : 'Crawl URL'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    )
}
