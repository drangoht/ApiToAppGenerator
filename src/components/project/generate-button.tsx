'use client'

import { Button } from '@/components/ui/button'
import { Play, Loader2 } from 'lucide-react'
import { generateAppAction } from '@/app/actions/generate'
import { useState } from 'react'
import { toast } from 'sonner' // Assuming sonner is installed, shadcn usually adds it

export function GenerateButton({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
    const [isLoading, setIsLoading] = useState(false)

    async function handleGenerate() {
        setIsLoading(true);
        // We could use toast here
        try {
            const result = await generateAppAction(projectId);
            if (result.success) {
                // Success toast
                console.log("Success");
            } else {
                // Error toast
                console.error("Error");
            }
        } catch (e) {
            console.error(e);
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
