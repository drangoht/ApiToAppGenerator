'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Play, ExternalLink } from 'lucide-react'

export default function SharePage({ params }: { params: Promise<{ projectId: string }> }) {
    const [projectId, setProjectId] = useState<string | null>(null)
    const [status, setStatus] = useState<'IDLE' | 'INSTALLING' | 'STARTING' | 'READY' | 'ERROR'>('IDLE')
    const [port, setPort] = useState<number | null>(null)

    useEffect(() => {
        params.then(p => setProjectId(p.projectId))
    }, [params])

    const fetchStatus = async () => {
        if (!projectId) return
        try {
            const res = await fetch(`/api/preview-status/${projectId}`)
            const data = await res.json()
            if (res.ok) {
                setStatus(data.status)
                setPort(data.port)
            }
        } catch { }
    }

    useEffect(() => {
        if (!projectId) return
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchStatus()
        const interval = setInterval(fetchStatus, 3000)
        return () => clearInterval(interval)
    }, [projectId])

    const proxyUrl = useMemo(() => {
        if (!port || !projectId) return null
        const origin = typeof window !== 'undefined' ? window.location.origin : ''
        return `${origin}/preview/${port}/${projectId}`
    }, [port, projectId])

    return (
        <div className="fixed inset-0 bg-black flex flex-col">
            {/* Thin top bar */}
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800 text-sm text-zinc-400 flex-shrink-0">
                <span className="font-semibold text-white">Apivolt Preview</span>
                <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${status === 'READY' ? 'bg-green-400' : status === 'ERROR' ? 'bg-red-400' : 'bg-yellow-400 animate-pulse'}`} />
                    <span>{status === 'READY' ? 'Running' : status === 'IDLE' ? 'Not Started' : status === 'INSTALLING' ? 'Installing...' : status === 'STARTING' ? 'Starting...' : 'Error'}</span>
                    {proxyUrl && (
                        <a href={proxyUrl} target="_blank" rel="noreferrer" className="ml-2 text-zinc-400 hover:text-white">
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 relative">
                {status === 'READY' && proxyUrl ? (
                    <iframe
                        src={proxyUrl}
                        className="absolute inset-0 w-full h-full border-0"
                        title="App Preview"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400 gap-4">
                        {status === 'IDLE' ? (
                            <>
                                <Play className="h-16 w-16 opacity-30" />
                                <p className="text-lg font-medium text-zinc-300">Preview not started</p>
                                <p className="text-sm text-center max-w-sm">
                                    This app preview is not currently running.<br />
                                    The project owner needs to start it from the Apivolt dashboard.
                                </p>
                            </>
                        ) : status === 'ERROR' ? (
                            <>
                                <div className="h-16 w-16 rounded-full bg-red-900/30 flex items-center justify-center text-red-400 text-2xl font-bold">!</div>
                                <p className="text-lg font-medium text-zinc-300">Preview failed</p>
                                <p className="text-sm">An error occurred while starting the preview server.</p>
                            </>
                        ) : (
                            <>
                                <Loader2 className="h-16 w-16 animate-spin opacity-50 text-blue-400" />
                                <p className="text-lg font-medium text-zinc-300">
                                    {status === 'INSTALLING' ? 'Installing dependencies...' : 'Starting app server...'}
                                </p>
                                <p className="text-sm">This may take a minute. The page will refresh automatically.</p>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
