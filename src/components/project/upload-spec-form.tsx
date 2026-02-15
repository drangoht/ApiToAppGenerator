'use client'

import { uploadOpenApiSpec } from '@/app/actions/upload'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useTransition, useState } from 'react'

export function UploadSpecForm({ projectId }: { projectId: string }) {
    const [isPending, startTransition] = useTransition()
    const [message, setMessage] = useState<string>('')

    async function handleSubmit(formData: FormData) {
        if (!formData.get('file')) return;

        startTransition(async () => {
            const result = await uploadOpenApiSpec(projectId, formData)
            if (result?.message) {
                setMessage(result.message)
            }
        })
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle>Upload OpenAPI Specification</CardTitle>
                <CardDescription>Upload your swagger.json or openapi.yaml file to get started.</CardDescription>
            </CardHeader>
            <form action={handleSubmit}>
                <CardContent>
                    <div className="grid w-full items-center gap-4">
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="file">OpenAPI File</Label>
                            <Input id="file" name="file" type="file" accept=".json,.yaml,.yml" required />
                        </div>
                        <div className="flex h-8 items-end space-x-1" aria-live="polite" aria-atomic="true">
                            {message && (
                                <p className={`text-sm ${message === 'Success' ? 'text-green-500' : 'text-red-500'}`}>{message}</p>
                            )}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-between">
                    <Button type="submit" disabled={isPending}>
                        {isPending ? 'Uploading & Parsing...' : 'Upload'}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    )
}
