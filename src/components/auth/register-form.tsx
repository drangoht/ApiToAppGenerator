'use client'

import { register, type RegisterState } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const initialState: RegisterState = {
    message: null,
    errors: {},
}

export function RegisterForm() {
    const [state, dispatch] = useActionState(register, initialState)
    const router = useRouter()

    useEffect(() => {
        // Simple redirect check if successful (needs more robust handling via return state)
        // But since server action redirects on success... wait.
        // If server action redirects, we don't need to handle it here.
        // But server action redirect throws, so we catch it?
        // Let's rely on server action redirect.
    }, [])

    return (
        <Card className="w-[350px]">
            <CardHeader>
                <CardTitle>Sign Up</CardTitle>
                <CardDescription>Create a new account to start generating apps.</CardDescription>
            </CardHeader>
            <form action={dispatch}>
                <CardContent>
                    <div className="grid w-full items-center gap-4">
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" name="name" placeholder="John Doe" required />
                            {state?.errors?.name && <p className="text-sm text-red-500">{state.errors.name}</p>}
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" name="email" type="email" placeholder="name@example.com" required />
                            {state?.errors?.email && <p className="text-sm text-red-500">{state.errors.email}</p>}
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" name="password" type="password" required />
                            {state?.errors?.password && <p className="text-sm text-red-500">{state.errors.password}</p>}
                        </div>
                        <div className="flex h-8 items-end space-x-1" aria-live="polite" aria-atomic="true">
                            {state?.message && (
                                <p className="text-sm text-red-500">{state.message}</p>
                            )}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                    <RegisterButton />
                </CardFooter>
            </form>
        </Card>
    )
}

function RegisterButton() {
    const { pending } = useFormStatus()
    return (
        <Button className="w-full" aria-disabled={pending}>
            {pending ? 'Creating account...' : 'Create account'}
        </Button>
    )
}
