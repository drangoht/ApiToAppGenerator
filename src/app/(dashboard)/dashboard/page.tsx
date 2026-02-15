import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus } from "lucide-react"

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
                            <CardFooter>
                                <Button variant="secondary" asChild className="w-full">
                                    <Link href={`/projects/${project.id}`}>Open</Link>
                                </Button>
                            </CardFooter>
                        </Card>
                    ))
                )}
            </div>
        </div>
    )
}
