import { LoginForm } from '@/components/auth/login-form'
import Link from 'next/link'

export default function LoginPage() {
    return (
        <div className="flex w-full flex-col items-center justify-center gap-6">
            <LoginForm />
            <p className="px-8 text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="underline underline-offset-4 hover:text-primary">
                    Sign up
                </Link>
            </p>
        </div>
    )
}
