'use client'

import { useState } from 'react'
import { saveTargetApiConfig } from '@/app/actions/target-config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Plus, Trash2 } from 'lucide-react'

const initialState: any = {
    message: '',
    success: false
}

export function TargetApiConfigForm({ projectId, initialConfig }: { projectId: string; initialConfig?: any }) {
    const [state, dispatch] = useActionState(saveTargetApiConfig.bind(null, projectId), initialState)

    // Convert object to array of { key, value }
    const initialPairs = initialConfig
        ? Object.entries(initialConfig).map(([k, v]) => ({ key: k, value: String(v) }))
        : []

    const [pairs, setPairs] = useState<{ key: string, value: string }[]>(initialPairs)

    const addPair = () => setPairs([...pairs, { key: '', value: '' }])

    const removePair = (index: number) => {
        const newPairs = [...pairs]
        newPairs.splice(index, 1)
        setPairs(newPairs)
    }

    const updatePair = (index: number, field: 'key' | 'value', val: string) => {
        const newPairs = [...pairs]
        newPairs[index][field] = val
        setPairs(newPairs)
    }

    // Convert back to object for submission
    const configObj = pairs.reduce((acc, pair) => {
        if (pair.key.trim()) {
            acc[pair.key.trim()] = pair.value.trim()
        }
        return acc
    }, {} as Record<string, string>)

    return (
        <form action={dispatch} className="grid gap-4">
            <input type="hidden" name="targetApiConfig" value={JSON.stringify(configObj)} />

            <div className="space-y-4">
                {pairs.map((pair, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                        <div className="flex-1">
                            <Input
                                placeholder="e.g. NEXT_PUBLIC_API_KEY"
                                value={pair.key}
                                onChange={e => updatePair(idx, 'key', e.target.value)}
                            />
                        </div>
                        <div className="flex-1">
                            <Input
                                placeholder="Value"
                                type="password"
                                value={pair.value}
                                onChange={e => updatePair(idx, 'value', e.target.value)}
                            />
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removePair(idx)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                    </div>
                ))}

                {pairs.length === 0 && (
                    <p className="text-sm text-muted-foreground">No environment variables defined.</p>
                )}

                <Button type="button" variant="outline" size="sm" onClick={addPair}>
                    <Plus className="w-4 h-4 mr-2" /> Add Variable
                </Button>
            </div>

            <div className="flex items-center justify-between mt-2">
                <div aria-live="polite" aria-atomic="true">
                    {state?.message && (
                        <p className={`text-sm ${state.success ? 'text-green-500' : 'text-red-500'}`}>{state.message}</p>
                    )}
                </div>
                <SubmitButton />
            </div>
        </form>
    )
}

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : 'Save Variables'}
        </Button>
    )
}
