import { auth } from "@/auth"
import { redirect } from "next/navigation"

import { LogoutButton } from "@/components/auth/logout-button"
import Link from "next/link"
import { Home } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()
    if (!session) redirect("/login")

    // We could add a side nav here
    return (
        <div className="flex min-h-screen flex-col bg-background/95">
            <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 shadow-sm">
                <Link href="/dashboard" className="flex items-center gap-3 font-bold hover:text-primary transition-colors text-lg" title="Return to Dashboard">
                    <img src="/logo.png" alt="AppForge Logo" className="h-7 w-7 rounded-md shadow-sm" />
                    <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-violet-400">AppForge</span>
                </Link>
                <div className="ml-auto flex items-center gap-4">
                    <ThemeToggle />
                    <span className="text-sm text-muted-foreground">{session.user?.email}</span>
                    <LogoutButton />
                </div>
            </header>
            <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
                {children}
            </main>
        </div>
    )
}
