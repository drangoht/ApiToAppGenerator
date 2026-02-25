'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Play, Square, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export function PreviewPanel({ projectId }: { projectId: string }) {
    const [status, setStatus] = useState<'IDLE' | 'INSTALLING' | 'STARTING' | 'READY' | 'ERROR'>('IDLE')
    const [port, setPort] = useState<number | null>(null)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const fetchStatus = async () => {
        try {
            const res = await fetch(`/api/projects/${projectId}/preview`)
            const data = await res.json()
            if (res.ok) {
                setStatus(data.status)
                setPort(data.port)
                if (data.errorMessage) setErrorMsg(data.errorMessage)
            }
        } catch (e) {
            console.error("Failed to fetch preview status");
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchStatus()

        // Polling if installing or starting
        let interval: NodeJS.Timeout;
        if (status === 'INSTALLING' || status === 'STARTING') {
            interval = setInterval(fetchStatus, 2000)
        }
        return () => clearInterval(interval)
    }, [status, projectId])

    const handleStartPreview = async () => {
        setIsLoading(true)
        setErrorMsg(null)
        try {
            const res = await fetch(`/api/projects/${projectId}/preview`, { method: 'POST' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to start preview')

            setStatus(data.status)
            setPort(data.port)
            toast.success("Preview isolated and starting...")
        } catch (e: any) {
            toast.error(e.message)
            setStatus('ERROR')
            setErrorMsg(e.message)
        } finally {
            setIsLoading(false)
        }
    }

    const handleStopPreview = async () => {
        setIsLoading(true)
        try {
            await fetch(`/api/projects/${projectId}/preview`, { method: 'DELETE' })
            setStatus('IDLE')
            setPort(null)
            toast.info("Preview stopped")
        } catch (e: any) {
            toast.error("Failed to stop preview")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card className="flex flex-col h-[700px]">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
                <CardTitle className="text-xl">Live Preview</CardTitle>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={fetchStatus} disabled={isLoading}>
                        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                    {(status === 'IDLE' || status === 'ERROR') ? (
                        <Button size="sm" onClick={handleStartPreview} disabled={isLoading}>
                            <Play className="h-4 w-4 mr-2" /> Start App
                        </Button>
                    ) : (
                        <Button size="sm" variant="destructive" onClick={handleStopPreview} disabled={isLoading}>
                            <Square className="h-4 w-4 mr-2" /> Stop App
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 relative bg-muted/20">
                {status === 'IDLE' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                        <Play className="h-12 w-12 mb-4 opacity-50" />
                        <p>Click "Start App" to build and run your generated project.</p>
                    </div>
                )}

                {status === 'INSTALLING' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                        <Loader2 className="h-12 w-12 mb-4 animate-spin opacity-50" />
                        <p>Installing NPM dependencies (this may take a minute)...</p>
                    </div>
                )}

                {status === 'STARTING' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                        <Loader2 className="h-12 w-12 mb-4 animate-spin opacity-50 text-blue-500" />
                        <p>Starting Next.js Development Server...</p>
                    </div>
                )}

                {status === 'READY' && port && (
                    <iframe
                        src={`${typeof window !== 'undefined' ? window.location.origin : ''}/preview/${port}/${projectId}?_rnd=${Date.now()}`}
                        className="w-full h-full border-0 bg-white"
                        title="App Preview"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                )}

                {status === 'ERROR' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-destructive p-6 text-center">
                        <div className="w-12 h-12 mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
                            <span className="text-xl font-bold">!</span>
                        </div>
                        <p className="font-semibold mb-2">Preview Failed</p>
                        <code className="text-sm bg-destructive/10 px-4 py-2 rounded break-all max-w-md">
                            {errorMsg || 'An unknown error occurred while starting the server.'}
                        </code>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
