import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { UploadSpecForm } from "@/components/project/upload-spec-form"
import { EndpointList } from "@/components/project/endpoint-list"
import { LlmConfigForm } from "@/components/project/llm-config-form"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { GenerateButton } from "@/components/project/generate-button"
import { DownloadButton } from "@/components/project/download-button"
import { PreviewPanel } from "@/components/project/preview-panel"
import { TargetApiConfigForm } from "@/components/project/target-api-config-form"
import { DeleteProjectButton } from "@/components/project/delete-project-button"
import { EditProjectDescription } from "@/components/project/edit-project-description"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Terminal, Eye, Settings, BookOpen, Cpu, Download, AlertTriangle } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await auth()
    if (!session?.user?.email) redirect("/login")

    const { id } = await params

    const project = await prisma.project.findUnique({
        where: { id },
        include: { enrichments: true }
    })

    if (!project) return <div>Project not found</div>

    const hasSpec = !!project.openApiSpec
    let endpoints: any[] = []
    let llmConfig: any = {}
    let specInfo: { title?: string; description?: string; version?: string } | null = null

    if (hasSpec) {
        try {
            const spec = JSON.parse(project.openApiSpec!)
            specInfo = spec.info || null
            const paths = spec.paths || {}
            for (const [path, methods] of Object.entries(paths)) {
                for (const [method, details] of Object.entries(methods as any)) {
                    if (['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].includes(method)) {
                        endpoints.push({
                            method,
                            path,
                            summary: (details as any).summary || "No summary",
                            description: (details as any).description || ""
                        })
                    }
                }
            }
        } catch { }
    }

    if (project.llmConfig) {
        try { llmConfig = JSON.parse(project.llmConfig) } catch { }
    }

    const targetApiConfig = project.targetApiConfig ? JSON.parse(project.targetApiConfig) : {}
    const zipName = `${project.name.replace(/\s+/g, '_')}_generated.zip`
    const folderName = `${project.name.replace(/\s+/g, '_')}_app`
    const isReady = project.status === 'READY'
    const isGenerating = project.status === 'GENERATING'

    const statusColors: Record<string, string> = {
        DRAFT: 'bg-zinc-500',
        GENERATING: 'bg-yellow-500 animate-pulse',
        READY: 'bg-green-500',
        ERROR: 'bg-red-500'
    }

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-2xl font-bold tracking-tight truncate">{project.name}</h1>
                        <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${statusColors[project.status] ?? 'bg-zinc-500'}`} />
                        <Badge variant="outline" className="text-xs flex-shrink-0">{project.status}</Badge>
                    </div>
                    <EditProjectDescription projectId={project.id} initialDescription={project.description || ""} />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {hasSpec && (
                        <GenerateButton projectId={project.id} disabled={isGenerating} />
                    )}
                    {isReady && (
                        <DownloadButton projectId={project.id} />
                    )}
                    <div className="pl-2 border-l">
                        <DeleteProjectButton projectId={project.id} />
                    </div>
                </div>
            </div>

            {/* ── No spec yet ── */}
            {!hasSpec ? (
                <div className="flex flex-col items-center gap-6 py-16">
                    <div className="rounded-full bg-muted p-6">
                        <BookOpen className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                        <h2 className="text-xl font-semibold mb-2">Upload your OpenAPI Specification</h2>
                        <p className="text-muted-foreground text-sm mb-6 max-w-md">
                            Upload a JSON or YAML OpenAPI specification to get started. AppForge will analyze it and generate a full Next.js frontend application.
                        </p>
                    </div>
                    <UploadSpecForm projectId={project.id} />
                </div>
            ) : (
                /* ── Tabbed layout ── */
                <Tabs defaultValue={isReady ? "preview" : "api"} className="space-y-4">
                    <TabsList className="grid w-full grid-cols-4 h-auto">
                        <TabsTrigger value="preview" className="flex items-center gap-2 py-2.5">
                            <Eye className="h-4 w-4" />
                            <span className="hidden sm:inline">Preview</span>
                        </TabsTrigger>
                        <TabsTrigger value="download" className="flex items-center gap-2 py-2.5">
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Download</span>
                        </TabsTrigger>
                        <TabsTrigger value="api" className="flex items-center gap-2 py-2.5">
                            <BookOpen className="h-4 w-4" />
                            <span className="hidden sm:inline">API Spec</span>
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="flex items-center gap-2 py-2.5">
                            <Settings className="h-4 w-4" />
                            <span className="hidden sm:inline">Settings</span>
                        </TabsTrigger>
                    </TabsList>

                    {/* ── Preview Tab ── */}
                    <TabsContent value="preview" className="mt-4">
                        {isReady ? (
                            <PreviewPanel projectId={project.id} />
                        ) : (
                            <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
                                <Cpu className="h-12 w-12 opacity-40" />
                                <div className="text-center">
                                    <p className="font-medium text-foreground mb-1">
                                        {isGenerating ? 'Generating your app...' : 'No app generated yet'}
                                    </p>
                                    <p className="text-sm">
                                        {isGenerating
                                            ? 'This may take a minute. The page will refresh when done.'
                                            : 'Click "Generate App" in the header to build your application.'
                                        }
                                    </p>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* ── Download Tab ── */}
                    <TabsContent value="download" className="mt-4">
                        {isReady ? (
                            <div className="grid gap-4 max-w-2xl mx-auto">
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Download className="h-5 w-5" /> Download & Run Locally
                                        </CardTitle>
                                        <CardDescription>
                                            Get the full generated source code as a ZIP archive for local development or deployment.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm border space-y-2">
                                            <div className="flex items-center gap-2 text-muted-foreground"><span className="select-none">$</span><span>unzip {zipName} -d {folderName}</span></div>
                                            <div className="flex items-center gap-2 text-muted-foreground"><span className="select-none">$</span><span>cd {folderName}</span></div>
                                            <div className="flex items-center gap-2 text-muted-foreground"><span className="select-none">$</span><span>npm install</span></div>
                                            <div className="flex items-center gap-2 text-muted-foreground"><span className="select-none">$</span><span>npm run dev</span></div>
                                        </div>
                                        <div className="flex items-start gap-3 p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-sm text-yellow-800 dark:text-yellow-200">
                                            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                            <p>
                                                The built-in sandbox preview may exhibit routing or compiler issues that do <b>not</b> exist when running locally.
                                                Local development is the recommended way to use the generated app.
                                            </p>
                                        </div>
                                        <DownloadButton projectId={project.id} className="w-full" />
                                    </CardContent>
                                </Card>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
                                <Download className="h-12 w-12 opacity-40" />
                                <div className="text-center">
                                    <p className="font-medium text-foreground mb-1">Nothing to download yet</p>
                                    <p className="text-sm">Generate your app first using the button in the header.</p>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* ── API Spec Tab ── */}
                    <TabsContent value="api" className="mt-4">
                        <div className="space-y-4">
                            {specInfo && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>
                                            {specInfo.title || 'API Specification'}
                                            {specInfo.version && (
                                                <Badge variant="outline" className="ml-2 font-mono text-xs">v{specInfo.version}</Badge>
                                            )}
                                        </CardTitle>
                                        {specInfo.description && (
                                            <div className="prose prose-sm dark:prose-invert max-w-none pt-2 text-muted-foreground">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {specInfo.description}
                                                </ReactMarkdown>
                                            </div>
                                        )}
                                    </CardHeader>
                                </Card>
                            )}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between">
                                        <span>Endpoints</span>
                                        <Badge variant="secondary">{endpoints.length} routes</Badge>
                                    </CardTitle>
                                    <CardDescription>
                                        Click <b>Edit</b> on any endpoint to add custom instructions that guide the AI during generation.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <EndpointList projectId={project.id} endpoints={endpoints} enrichments={project.enrichments} />
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* ── Settings Tab ── */}
                    <TabsContent value="settings" className="mt-4">
                        <div className="grid gap-4 max-w-2xl mx-auto">
                            {/* AI Model Config */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Cpu className="h-5 w-5" /> AI Model Configuration
                                    </CardTitle>
                                    <CardDescription>
                                        Choose which LLM provider and model AppForge uses to generate your application.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="mb-4 flex items-start gap-3 p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200">
                                        <span className="mt-0.5">ℹ️</span>
                                        <p>
                                            For reliable output we recommend <b>Anthropic Claude 3.5 Sonnet</b> or <b>OpenAI GPT-4o</b>.
                                            Weaker models often produce invalid Next.js routing patterns.
                                        </p>
                                    </div>
                                    <LlmConfigForm projectId={project.id} initialConfig={llmConfig} />
                                </CardContent>
                            </Card>

                            {/* Target Env Vars */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Terminal className="h-5 w-5" /> Target App Environment Variables
                                    </CardTitle>
                                    <CardDescription>
                                        These are injected into the generated app's <code>.env.local</code> file (e.g. API base URL, tokens).
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <TargetApiConfigForm projectId={project.id} initialConfig={targetApiConfig} />
                                </CardContent>
                            </Card>

                            {/* Project Stats */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Project Info</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <dl className="grid grid-cols-3 gap-4 text-sm">
                                        <div>
                                            <dt className="text-muted-foreground">Endpoints</dt>
                                            <dd className="font-semibold text-lg">{endpoints.length}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-muted-foreground">Enriched</dt>
                                            <dd className="font-semibold text-lg">{project.enrichments.length}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-muted-foreground">Created</dt>
                                            <dd className="font-semibold">{project.createdAt.toLocaleDateString()}</dd>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>

                            {/* Danger Zone */}
                            <Card className="border-destructive/50">
                                <CardHeader>
                                    <CardTitle className="text-destructive flex items-center gap-2">
                                        <AlertTriangle className="h-5 w-5" /> Danger Zone
                                    </CardTitle>
                                    <CardDescription>
                                        Permanently delete this project and all its generated files. This cannot be undone.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <DeleteProjectButton projectId={project.id} />
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            )}
        </div>
    )
}
