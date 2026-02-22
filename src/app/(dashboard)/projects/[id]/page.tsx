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
import { PreviewPanel } from "@/components/project/preview-panel"
import { TargetApiConfigForm } from "@/components/project/target-api-config-form"
import { DeleteProjectButton } from "@/components/project/delete-project-button"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { EditProjectDescription } from "@/components/project/edit-project-description"

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth()
    if (!session?.user?.email) redirect("/login")

    const { id } = await params

    const project = await prisma.project.findUnique({
        where: { id },
        include: {
            enrichments: true
        }
    })

    if (!project) return <div>Project not found</div>

    const hasSpec = !!project.openApiSpec
    let endpoints: any[] = [];
    let llmConfig = {};
    let specInfo: { title?: string, description?: string, version?: string } | null = null;

    if (hasSpec) {
        try {
            const spec = JSON.parse(project.openApiSpec!);
            specInfo = spec.info || null;
            const paths = spec.paths || {};
            for (const [path, methods] of Object.entries(paths)) {
                for (const [method, details] of Object.entries(methods as any)) {
                    if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
                        endpoints.push({
                            method,
                            path,
                            summary: (details as any).summary || "No summary",
                            description: (details as any).description || ""
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

    let targetApiConfig = {};
    if (project.targetApiConfig) {
        try {
            targetApiConfig = JSON.parse(project.targetApiConfig);
        } catch (e) { }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
                    <EditProjectDescription projectId={project.id} initialDescription={project.description || ""} />
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
                    )}
                    <div className="ml-4 pl-4 border-l">
                        <DeleteProjectButton projectId={project.id} />
                    </div>
                </div>
            </div>

            {!hasSpec ? (
                <div className="flex justify-center py-12">
                    <UploadSpecForm projectId={project.id} />
                </div>
            ) : (
                <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
                    <div className="lg:col-span-2 space-y-6">
                        {project.status === 'READY' && (
                            <>
                                <Card className="border-green-200 dark:border-green-900 shadow-sm">
                                    <CardHeader className="bg-green-50/50 dark:bg-green-900/10 pb-4">
                                        <CardTitle className="text-xl flex items-center gap-2 text-green-800 dark:text-green-300">
                                            <span>💻 Run Locally (Recommended)</span>
                                            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100 border-none ml-auto">Best Experience</Badge>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="pt-6 space-y-4">
                                        <div className="text-sm text-muted-foreground space-y-3">
                                            <p>
                                                For the most stable, feature-complete experience without container constraints, we strongly recommend deploying the generated application directly on your local machine.
                                            </p>
                                            <div className="bg-muted/50 p-4 rounded-md font-mono text-sm border space-y-2">
                                                <div className="flex items-center gap-2"><span className="select-none text-muted-foreground">$</span> <span>unzip generated-app.zip</span></div>
                                                <div className="flex items-center gap-2"><span className="select-none text-muted-foreground">$</span> <span>cd generated-app</span></div>
                                                <div className="flex items-center gap-2"><span className="select-none text-muted-foreground">$</span> <span>npm install</span></div>
                                                <div className="flex items-center gap-2"><span className="select-none text-muted-foreground">$</span> <span>npm run dev</span></div>
                                            </div>
                                            <p className="text-xs">
                                                <b className="text-foreground">Note on Preview:</b> The built-in sandbox preview below operates in an isolated Docker sub-environment. Next.js App Router applications are exceedingly complex to sandbox dynamically, and the live preview may occasionally exhibit routing bugs, hot-reloading failures, or compiler crashes that do <b>not</b> exist in the actual downloaded code.
                                            </p>
                                        </div>
                                        <div className="pt-2">
                                            <DownloadButton projectId={project.id} className="w-full sm:w-auto font-medium" />
                                        </div>
                                    </CardContent>
                                </Card>

                                <PreviewPanel projectId={project.id} />
                            </>
                        )}
                        <Card>
                            <CardHeader>
                                <CardTitle>API Specification</CardTitle>
                                {specInfo && (
                                    <div className="mt-4 text-sm text-muted-foreground border-b pb-4">
                                        {specInfo.title && <p className="text-lg font-semibold text-foreground mb-2">{specInfo.title} {specInfo.version ? `(v${specInfo.version})` : ''}</p>}
                                        {specInfo.description && (
                                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {specInfo.description}
                                                </ReactMarkdown>
                                            </div>
                                        )}
                                    </div>
                                )}
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
                            <CardContent className="space-y-6">
                                <div>
                                    <h3 className="text-lg font-medium mb-4">AppForge AI Context</h3>
                                    <div className="bg-blue-50/50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800 rounded-md p-3 mb-6 text-sm flex gap-2 items-start">
                                        <div className="mt-0.5">ℹ️</div>
                                        <div>
                                            <p className="font-semibold mb-1">Model Recommendation</p>
                                            <p className="opacity-90 leading-relaxed">Generating a full Next.js App Router application is highly complex. For reliable syntax and logic, we strongly recommend using <b>Anthropic Claude 3.5 Sonnet</b> or <b>OpenAI GPT-4o</b>. Weaker models will frequently hallucinate invalid Next.js routing patterns or broken React hooks.</p>
                                        </div>
                                    </div>
                                    <LlmConfigForm projectId={project.id} initialConfig={llmConfig} />
                                </div>
                                <div className="border-t pt-6">
                                    <h3 className="text-lg font-medium mb-4">Target App Environment Variables</h3>
                                    <TargetApiConfigForm projectId={project.id} initialConfig={targetApiConfig} />
                                </div>
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
