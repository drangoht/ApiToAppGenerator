'use client'

import { useState, useRef, useEffect } from "react"
import { updateProjectDescription } from "@/app/actions/project"
import { Pencil, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Textarea } from "@/components/ui/textarea"

export function EditProjectDescription({ projectId, initialDescription }: { projectId: string, initialDescription: string }) {
    const [isEditing, setIsEditing] = useState(false)
    const [description, setDescription] = useState(initialDescription || '')
    const [isLoading, setIsLoading] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus()
            // Move cursor to end
            textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length)
        }
    }, [isEditing])

    const handleSave = async () => {
        if (description === initialDescription) {
            setIsEditing(false)
            return
        }

        setIsLoading(true)
        const result = await updateProjectDescription(projectId, description)
        setIsLoading(false)

        if (result?.error) {
            toast.error(result.error)
            setDescription(initialDescription) // revert
        } else {
            toast.success("Description updated")
        }
        setIsEditing(false)
    }

    const cancel = () => {
        setDescription(initialDescription)
        setIsEditing(false)
    }

    if (isEditing) {
        return (
            <div className="flex gap-2 items-start mt-1">
                <Textarea
                    ref={textareaRef}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[80px] w-full max-w-lg"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSave()
                        }
                        if (e.key === 'Escape') {
                            cancel()
                        }
                    }}
                    disabled={isLoading}
                />
                <div className="flex flex-col gap-1">
                    <Button size="icon" variant="default" onClick={handleSave} disabled={isLoading} className="h-8 w-8">
                        <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={cancel} disabled={isLoading} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="group flex items-start gap-2 max-w-2xl mt-1">
            <p className="text-muted-foreground break-words min-w-[200px]">
                {description || <span className="italic opacity-50">No description provided</span>}
            </p>
            <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 h-6 w-6 shrink-0 transition-opacity"
                onClick={() => setIsEditing(true)}
                title="Edit Description"
            >
                <Pencil className="h-3 w-3 text-muted-foreground" />
            </Button>
        </div>
    )
}
