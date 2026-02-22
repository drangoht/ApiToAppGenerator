import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DownloadButton } from './download-button'

describe('DownloadButton', () => {
    const originalLocation = window.location;

    beforeEach(() => {
        // Intercept native browser navigation properties
        // @ts-ignore
        delete window.location;
        window.location = { href: '' } as any;
    })

    afterEach(() => {
        // Restore DOM context
        window.location = originalLocation;
    })

    it('renders with injected classNames and triggers correct static API download endpoint', () => {
        render(<DownloadButton projectId="proj-123" className="test-class-injection" />)

        const btn = screen.getByRole('button', { name: /Download Code/i })
        expect(btn).toBeInTheDocument()
        expect(btn).toHaveClass('test-class-injection')

        fireEvent.click(btn)

        expect(window.location.href).toBe('/api/projects/proj-123/download')
    })
})
