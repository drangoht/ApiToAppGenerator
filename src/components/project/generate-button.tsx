'use client'

import { Button } from '@/components/ui/button'
import { Play, Loader2 } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export function GenerateButton({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
    const [isGenerating, setIsGenerating] = useState(disabled || false)
    const router = useRouter()
    const pollRef = useRef<NodeJS.Timeout | null>(null)

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current)
            pollRef.current = null
        }
    }, [])

    const startPolling = useCallback(() => {
        stopPolling()
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/projects/${projectId}/generate`)
                const data = await res.json()

                if (data.status === 'READY') {
                    stopPolling()
                    setIsGenerating(false)
                    toast.success('App generated successfully! 🎉')
                    router.refresh()
                } else if (data.status === 'ERROR') {
                    stopPolling()
                    setIsGenerating(false)
                    toast.error('Generation failed. Please check your API key and try again.')
                    router.refresh()
                }
                // If still GENERATING, keep polling
            } catch {
                // Network error during poll — keep trying
            }
        }, 3000) // Poll every 3 seconds
    }, [projectId, router, stopPolling])

    // If page loads with status=GENERATING (e.g. after page refresh), start polling immediately
    useEffect(() => {
        if (disabled) {
            startPolling()
        }
        return () => stopPolling()
    }, [disabled, startPolling, stopPolling])

    async function handleGenerate() {
        setIsGenerating(true)
        try {
            const res = await fetch(`/api/projects/${projectId}/generate`, { method: 'POST' })
            const data = await res.json()

            if (!res.ok) {
                toast.error(data.error || 'Failed to start generation')
                setIsGenerating(false)
                return
            }

            // 202 Accepted — generation started in background, begin polling
            toast.info('Generation started — this may take 1–3 minutes...')
            startPolling()
        } catch {
            toast.error('An unexpected error occurred')
            setIsGenerating(false)
        }
    }

    return (
        <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating...</>
                : <><Play className="mr-2 h-4 w-4" /> Generate App</>
            }
        </Button>
    )
}
