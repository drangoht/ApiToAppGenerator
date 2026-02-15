'use client'

import { createProject } from '@/app/actions/project'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

const initialState = {
    message: '',
    errors: {},
}

export function CreateProjectForm() {
    const [state, dispatch] = useActionState(createProject, initialState)

    return (
        <Card className="w-[450px]">
            <CardHeader>
                <CardTitle>Create Project</CardTitle>
                <CardDescription>Start a new app generation project.</CardDescription>
            </CardHeader>
            <form action={dispatch}>
                <CardContent>
                    <div className="grid w-full items-center gap-4">
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="name">Project Name</Label>
                            <Input id="name" name="name" placeholder="My Awesome App" required />
                            {state?.errors?.name && <p className="text-sm text-red-500">{state.errors.name}</p>}
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="description">Description</Label>
                            <Textarea id="description" name="description" placeholder="A brief description of your project..." />
                            {state?.errors?.description && <p className="text-sm text-red-500">{state.errors.description}</p>}
                        </div>
                        <div className="flex h-8 items-end space-x-1" aria-live="polite" aria-atomic="true">
                            {state?.message && (
                                <p className="text-sm text-red-500">{state.message}</p>
                            )}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                    <SubmitButton />
                </CardFooter>
            </form>
        </Card>
    )
}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <Button type="submit" className="w-full" aria-disabled={pending}>
            {pending ? 'Creating...' : 'Create Project'}
        </Button>
    )
}
