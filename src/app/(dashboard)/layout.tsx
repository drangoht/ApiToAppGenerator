import { auth } from "@/auth"
import { redirect } from "next/navigation"

import { LogoutButton } from "@/components/auth/logout-button"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()
    if (!session) redirect("/login")

    // We could add a side nav here
    return (
        <div className="flex min-h-screen flex-col">
            <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-6">
                <h1 className="font-semibold">API-to-App Generator</h1>
                <div className="ml-auto flex items-center gap-4">
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
