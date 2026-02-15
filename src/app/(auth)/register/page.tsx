import { RegisterForm } from '@/components/auth/register-form'
import Link from 'next/link'

export default function RegisterPage() {
    return (
        <div className="flex w-full flex-col items-center justify-center gap-6">
            <RegisterForm />
            <p className="px-8 text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="underline underline-offset-4 hover:text-primary">
                    Sign in
                </Link>
            </p>
        </div>
    )
}
