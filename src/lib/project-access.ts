import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import type { Project, User } from "@prisma/client"

export interface ProjectAccess {
  user: User
  project: Project
}

export async function verifySession(): Promise<User | null> {
  const session = await auth()
  if (!session?.user?.email) return null
  return prisma.user.findUnique({ where: { email: session.user.email } })
}

export async function verifyProjectAccess(projectId: string): Promise<ProjectAccess | null> {
  const user = await verifySession()
  if (!user) return null

  const project = await prisma.project.findUnique({ where: { id: projectId } })
  if (!project || project.ownerId !== user.id) return null

  return { user, project }
}
