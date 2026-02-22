'use client'

import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

export function DownloadButton({ projectId, className }: { projectId: string; className?: string }) {
    const handleDownload = () => {
        window.location.href = `/api/projects/${projectId}/download`
    }

    return (
        <Button onClick={handleDownload} variant="outline" className={className}>
            <Download className="mr-2 h-4 w-4" /> Download Code
        </Button>
    )
}
