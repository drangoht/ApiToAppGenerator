"use client"

import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { signOut } from "next-auth/react"

export function LogoutButton() {
    const handleLogout = async () => {
        await signOut({ redirect: false })
        window.location.href = '/login'
    }

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="gap-2"
        >
            <LogOut className="h-4 w-4" />
            Sign Out
        </Button>
    )
}
