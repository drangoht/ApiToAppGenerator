'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import { z } from "zod"

const createProjectSchema = z.object({
    name: z.string().min(3, { message: "Name must be at least 3 characters" }),
    description: z.string().optional(),
})

export async function createProject(prevState: any, formData: FormData) {
    const session = await auth()
    if (!session?.user?.email) return { message: "Unauthorized" }

    const validatedFields = createProjectSchema.safeParse({
        name: formData.get('name'),
        description: formData.get('description'),
    })

    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors }
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } })
    if (!user) return { message: "User not found" }

    let project;
    try {
        project = await prisma.project.create({
            data: {
                name: validatedFields.data.name,
                description: validatedFields.data.description,
                ownerId: user.id,
            },
        })
    } catch (error) {
        console.error(error)
        return { message: "Database Error: Failed to Create Project." }
    }

    redirect(`/projects/${project.id}`)
}
