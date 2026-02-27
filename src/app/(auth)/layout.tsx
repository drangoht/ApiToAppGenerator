import { ThemeToggle } from "@/components/theme-toggle"

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="grid min-h-screen w-full lg:grid-cols-2 relative">
            <div className="absolute top-6 left-6 z-50">
                <ThemeToggle />
            </div>
            <div className="flex items-center justify-center p-8 bg-background relative">
                <div className="mx-auto w-full max-w-[400px]">
                    {children}
                </div>
            </div>
            <div className="hidden lg:flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-blue-900 to-violet-900 p-12 text-white relative overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
                <div className="z-10 flex flex-col items-center text-center space-y-6">
                    <img src="/logo.png" alt="Apivolt Logo" className="h-24 w-24 rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/20" />
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight mb-2 bg-gradient-to-r from-blue-200 to-indigo-100 bg-clip-text text-transparent">Apivolt</h1>
                        <p className="text-indigo-200 text-lg max-w-md">
                            The ultimate AI-powered API-to-App generator. Turn mere specifications into fully functional, stunning web applications in seconds.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
