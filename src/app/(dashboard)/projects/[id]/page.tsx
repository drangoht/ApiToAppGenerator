import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { UploadSpecForm } from "@/components/project/upload-spec-form"
import { EndpointList } from "@/components/project/endpoint-list"
import { LlmConfigForm } from "@/components/project/llm-config-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Play } from "lucide-react"
import { GenerateButton } from "@/components/project/generate-button"
import { DownloadButton } from "@/components/project/download-button"

export default async function ProjectPage({ params }: { params: { id: string } }) {
    const session = await auth()
    if (!session?.user?.email) redirect("/login")

    const project = await prisma.project.findUnique({
        where: { id: params.id },
        include: {
            enrichments: true
        }
    })

    if (!project) return <div>Project not found</div>

    const hasSpec = !!project.openApiSpec
    let endpoints: any[] = [];
    let llmConfig = {};

    if (hasSpec) {
        try {
            const spec = JSON.parse(project.openApiSpec!);
            const paths = spec.paths || {};
            for (const [path, methods] of Object.entries(paths)) {
                for (const [method, details] of Object.entries(methods as any)) {
                    if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
                        endpoints.push({
                            method,
                            path,
                            summary: (details as any).summary || (details as any).description
                        });
                    }
                }
            }
        } catch (e) {
            console.error("Failed to parse stored spec", e);
        }
    }

    if (project.llmConfig) {
        try {
            llmConfig = JSON.parse(project.llmConfig);
        } catch (e) { }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
                    <p className="text-muted-foreground">{project.description}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant={project.status === 'DRAFT' ? 'secondary' : 'default'}>
                        {project.status}
                    </Badge>
                    {hasSpec && (
                        <div className="flex gap-2">
                            <GenerateButton projectId={project.id} disabled={project.status === 'GENERATING'} />
                            {project.status === 'READY' && <DownloadButton projectId={project.id} />}
                        </div>
                    )}    </div>
            </div>

            {!hasSpec ? (
                <div className="flex justify-center py-12">
                    <UploadSpecForm projectId={project.id} />
                </div>
            ) : (
                <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>API Specification</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="max-h-[500px] overflow-auto">
                                    <EndpointList projectId={project.id} endpoints={endpoints} enrichments={project.enrichments} />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Configuration</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <LlmConfigForm projectId={project.id} initialConfig={llmConfig} />
                            </CardContent>
                        </Card>

                        <div className="rounded-md border p-4 bg-muted/50">
                            <h4 className="font-semibold mb-2 text-sm">Project Info</h4>
                            <div className="text-sm space-y-1">
                                <p><span className="text-muted-foreground">Endpoints:</span> {endpoints.length}</p>
                                <p><span className="text-muted-foreground">Enriched:</span> {project.enrichments.length}</p>
                                <p><span className="text-muted-foreground">Created:</span> {project.createdAt.toLocaleDateString()}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
