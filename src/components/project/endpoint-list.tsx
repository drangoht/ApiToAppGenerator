'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetFooter,
} from "@/components/ui/sheet"
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { saveEnrichment } from '@/app/actions/enrichment'

type Enrichment = {
    method: string
    path: string
    description: string | null
    instruction: string | null
}

type Endpoint = {
    method: string
    path: string
    summary?: string
    description?: string
}

export function EndpointList({ projectId, endpoints, enrichments }: { projectId: string; endpoints: Endpoint[]; enrichments: Enrichment[] }) {

    // Helper to find existing enrichment
    const getEnrichment = (method: string, path: string) => {
        return enrichments.find(e => e.method === method && e.path === path)
    }

    return (
        <div className="grid gap-4">
            {endpoints.map((ep, idx) => {
                const enrichment = getEnrichment(ep.method.toUpperCase(), ep.path)
                const hasInstruction = enrichment?.instruction && enrichment.instruction.length > 0;

                return (
                    <Card key={`${ep.method}-${ep.path}-${idx}`} className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-4">
                            <Badge variant="outline" className={`uppercase w-16 justify-center ${ep.method === 'get' ? 'bg-blue-100 text-blue-800' :
                                ep.method === 'post' ? 'bg-green-100 text-green-800' :
                                    ep.method === 'put' ? 'bg-orange-100 text-orange-800' :
                                        ep.method === 'delete' ? 'bg-red-100 text-red-800' : ''
                                }`}>
                                {ep.method}
                            </Badge>
                            <div>
                                <div className="font-mono text-sm">{ep.path}</div>
                                <div className="text-xs text-muted-foreground">{ep.summary || "No summary"}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {hasInstruction && <Badge variant="secondary">Enriched</Badge>}
                            <EnrichmentSheet projectId={projectId} endpoint={ep} enrichment={enrichment} />
                        </div>
                    </Card>
                )
            })}
        </div>
    )
}

function EnrichmentSheet({ projectId, endpoint, enrichment }: { projectId: string; endpoint: Endpoint; enrichment?: Enrichment }) {
    const [description, setDescription] = useState(enrichment?.description || endpoint.summary || '')
    const [instruction, setInstruction] = useState(enrichment?.instruction || '')
    const [isOpen, setIsOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    async function handleSave() {
        setIsSaving(true)
        await saveEnrichment(projectId, endpoint.method.toUpperCase(), endpoint.path, description, instruction)
        setIsSaving(false)
        setIsOpen(false)
    }

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm">Edit</Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-xl">
                <SheetHeader>
                    <SheetTitle>Enrich Endpoint</SheetTitle>
                    <SheetDescription>
                        Add context and instructions for the LLM to generate better code for this endpoint.
                    </SheetDescription>
                </SheetHeader>
                <div className="grid gap-4 py-4">
                    <div className="flex items-center gap-4">
                        <Badge className="uppercase">{endpoint.method}</Badge>
                        <code className="text-sm bg-muted px-2 py-1 rounded">{endpoint.path}</code>
                    </div>
                    {endpoint.description && (
                        <div className="text-sm p-3 bg-muted/50 rounded-md border border-border/50">
                            <strong>OpenAPI Description:</strong>
                            <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{endpoint.description}</p>
                        </div>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="description">Description (Architecture/Business Logic)</Label>
                        <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="instruction">LLM Instructions (Specific Rules)</Label>
                        <Textarea
                            id="instruction"
                            value={instruction}
                            onChange={(e) => setInstruction(e.target.value)}
                            placeholder="e.g. 'Use a modal for this action', 'Requires 'admin' role', 'Display as a chart'"
                            className="h-32"
                        />
                    </div>
                </div>
                <SheetFooter>
                    <Button type="submit" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    )
}
