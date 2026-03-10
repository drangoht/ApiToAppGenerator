import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LogoutButton } from './logout-button'
import * as nextAuthReact from 'next-auth/react'

// Mock the next-auth module deeply to intercept explicit logic
vi.mock('next-auth/react', () => ({
    signOut: vi.fn()
}))

describe('LogoutButton', () => {
    const originalLocation = window.location;

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock native window.location property to catch mutations
        // @ts-expect-error jsdom location override for test
        delete window.location;
        window.location = { href: '' } as unknown as Location & { href: string };
    })

    afterEach(() => {
        window.location = originalLocation;
    })

    it('bypasses 0.0.0.0 NextAuth URL resolution by forcing static window redirect explicitly', async () => {
        // Assert mock implementation to immediately resolve the internal await execution
        const mockSignOut = vi.mocked(nextAuthReact.signOut).mockResolvedValue(undefined as never)

        render(<LogoutButton />)

        const btn = screen.getByRole('button', { name: /Sign Out/i })

        fireEvent.click(btn)

        // flush microtasks
        await new Promise(process.nextTick);

        // NextAuth MUST be called with redirect false
        expect(mockSignOut).toHaveBeenCalledWith({ redirect: false })

        // Native browser MUST fallback to absolute origin redirection
        expect(window.location.href).toBe('/login')
    })
})
