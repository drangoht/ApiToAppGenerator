import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Beaker } from "lucide-react"
import { DeleteProjectButton } from "@/components/project/delete-project-button"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

export default async function DashboardPage() {
    const session = await auth()
    if (!session?.user?.email) redirect("/login")

    // Fetch user to ensure we have the ID (and existence)
    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) redirect("/login")

    const userProjects = await prisma.project.findMany({
        where: { ownerId: user.id },
        orderBy: { createdAt: 'desc' }
    })

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                <Button asChild>
                    <Link href="/projects/new">
                        <Plus className="mr-2 h-4 w-4" /> New Project
                    </Link>
                </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {userProjects.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center p-8 text-center border rounded-lg border-dashed">
                        <h3 className="text-lg font-semibold">No projects yet</h3>
                        <p className="text-sm text-muted-foreground mb-4">Create your first project to start generating apps.</p>
                        <Button asChild variant="outline">
                            <Link href="/projects/new">Create Project</Link>
                        </Button>
                    </div>
                ) : (
                    userProjects.map((project) => (
                        <Card key={project.id}>
                            <CardHeader>
                                <CardTitle>{project.name}</CardTitle>
                                <CardDescription>{project.description || "No description"}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground">Status: <span className="font-medium">{project.status}</span></p>
                            </CardContent>
                            <CardFooter className="flex gap-2">
                                <Button variant="secondary" asChild className="flex-1">
                                    <Link href={`/projects/${project.id}`}>Open</Link>
                                </Button>
                                <DeleteProjectButton projectId={project.id} />
                            </CardFooter>
                        </Card>
                    ))
                )}
            </div>

            {/* Documentation Section */}
            <div className="mt-20 pt-16 border-t border-border/40">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold tracking-tight mb-4 flex items-center justify-center gap-2">
                        <Beaker className="h-8 w-8 text-indigo-500" /> How to use AppForge
                    </h2>
                    <p className="text-muted-foreground text-lg">Follow this quick tutorial to generate your first application.</p>
                </div>

                <div className="max-w-4xl mx-auto pb-16">
                    <Accordion type="single" collapsible className="w-full space-y-4" defaultValue="step-1">
                        <AccordionItem value="step-1" className="border bg-card px-6 py-2 rounded-lg shadow-sm">
                            <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">1</span>
                                    Create a New Project
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground pt-4 pb-6">
                                <div className="space-y-6">
                                    <p className="text-base leading-relaxed">
                                        Begin by navigating to the Dashboard and clicking the <b>"New Project"</b> button in the top right corner. Give your project a descriptive name and summary.
                                    </p>
                                    <div className="rounded-xl overflow-hidden border shadow-sm">
                                        <img
                                            src="/docs/dashboard.png"
                                            alt="AppForge Dashboard interface showing project list and New Project button"
                                            className="w-full object-cover"
                                        />
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="step-2" className="border bg-card px-6 py-2 rounded-lg shadow-sm">
                            <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">2</span>
                                    Upload OpenAPI Specification
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground pt-4 pb-6">
                                <p className="text-base leading-relaxed">
                                    Once inside your newly created project, upload a valid JSON or YAML <b>OpenAPI 3.0+ Specification</b>. This definition acts as the absolute source of truth that the AI will use to generate the React components, network layers, and forms.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="step-3" className="border bg-card px-6 py-2 rounded-lg shadow-sm">
                            <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">3</span>
                                    Enrich and Configure AI
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground pt-4 pb-6">
                                <div className="space-y-6">
                                    <p className="text-base leading-relaxed">
                                        AppForge parses your specification and displays all valid REST endpoints. You can inject custom instructions into specific API paths to forcefully guide the AI's rendering logic.
                                        <br /><br />
                                        Finally, select your target LLM in the Configuration panel. We strongly recommend using high-parameter models like <b>Claude 3.5 Sonnet</b> or <b>GPT-4o</b> for robust Next.js generation.
                                    </p>
                                    <div className="rounded-xl overflow-hidden border shadow-sm">
                                        <img
                                            src="/docs/editor.png"
                                            alt="AppForge Project Interface showing parsed Swagger endpoints and AI Configuration settings"
                                            className="w-full object-cover"
                                        />
                                    </div>
                                </div>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="step-4" className="border bg-card px-6 py-2 rounded-lg shadow-sm">
                            <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">4</span>
                                    Generate, Preview, and Download
                                </div>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground pt-4 pb-6">
                                <p className="text-base leading-relaxed">
                                    Click <b>Generate Application</b>. AppForge will efficiently minify your spec to conserve tokens, compile an extensive system prompt covering complex framework routing rules, and execute the completion.
                                    <br /><br />
                                    Once finished, you can test the application dynamically via the built-in isolated sandbox preview. However, for a complete lag-free experience, it is heavily recommended to click <b>Download Code</b> and launch the repository natively via `npm run dev`.
                                </p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>
            </div>
        </div>
    )
}
