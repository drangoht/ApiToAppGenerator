'use client'

import { Button } from '@/components/ui/button'
import { Play, Loader2 } from 'lucide-react'
import { generateAppAction } from '@/app/actions/generate'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export function GenerateButton({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    async function handleGenerate() {
        setIsLoading(true);
        try {
            const result = await generateAppAction(projectId);
            if (result.success) {
                toast.success(result.message);
                // Refresh the page's server components so Preview & Download panels appear
                // without requiring the user to navigate away and back.
                router.refresh();
            } else {
                toast.error(result.message);
            }
        } catch (e) {
            console.error(e);
            toast.error('An unexpected error occurred during generation.');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Button onClick={handleGenerate} disabled={disabled || isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {isLoading ? 'Generating...' : 'Generate App'}
        </Button>
    )
}
