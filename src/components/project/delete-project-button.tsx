'use client'

import { useState, useTransition } from 'react'
import { deleteProjectAction } from '@/app/actions/delete-project'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'

export function DeleteProjectButton({ projectId }: { projectId: string }) {
    const [isPending, startTransition] = useTransition()
    const [isConfirming, setIsConfirming] = useState(false)
    const router = useRouter()
    const pathname = usePathname()

    const handleDelete = () => {
        if (!isConfirming) {
            setIsConfirming(true)
            // Auto reset confirmation after 3s
            setTimeout(() => setIsConfirming(false), 3000)
            return
        }

        startTransition(async () => {
            try {
                const res = await deleteProjectAction(projectId)
                if (res?.success) {
                    if (pathname.includes(projectId)) {
                        router.push('/dashboard')
                    } else {
                        router.refresh()
                    }
                }
            } catch (e: any) {
                alert(e.message || "Failed to delete project")
                setIsConfirming(false)
            }
        })
    }

    return (
        <Button
            variant={isConfirming ? "destructive" : "outline"}
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
            className={isConfirming ? "animate-pulse" : "text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground"}
        >
            <Trash2 className="w-4 h-4 mr-2" />
            {isPending ? 'Deleting...' : isConfirming ? 'Click again to confirm' : 'Delete'}
        </Button>
    )
}
