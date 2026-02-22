import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Code2, Cpu, Zap, Beaker } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24 md:py-32 bg-gradient-to-b from-background to-muted/20">
        <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 mb-6">
          AppForge v1.0
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 max-w-4xl bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
          From API Spec to Full-Stack App in Seconds
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
          Upload your OpenAPI specification, select an LLM, and instantly generate a complete, deployable Next.js App Router application powered by Shadcn UI and Prisma.
        </p>
        <div className="flex gap-4 flex-col sm:flex-row">
          <Link href="/dashboard">
            <Button size="lg" className="h-12 px-8 text-base shadow-lg">
              Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href="#documentation">
            <Button variant="outline" size="lg" className="h-12 px-8 text-base">
              Read Documentation
            </Button>
          </Link>
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center p-6 bg-card rounded-xl border shadow-sm">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/40 rounded-full mb-4">
                <Code2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-bold mb-2">Modern Stack</h3>
              <p className="text-sm text-muted-foreground">Generates pristine Next.js 14 code with React Server Components, Tailwind CSS, and strict TypeScript typings.</p>
            </div>
            <div className="flex flex-col items-center text-center p-6 bg-card rounded-xl border shadow-sm">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/40 rounded-full mb-4">
                <Cpu className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold mb-2">LLM Powered</h3>
              <p className="text-sm text-muted-foreground">Attach specific instructions to API endpoints. The AI natively binds complex business logic directly to your OpenAPI spec.</p>
            </div>
            <div className="flex flex-col items-center text-center p-6 bg-card rounded-xl border shadow-sm">
              <div className="p-3 bg-green-100 dark:bg-green-900/40 rounded-full mb-4">
                <Zap className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-bold mb-2">Instant Preview</h3>
              <p className="text-sm text-muted-foreground">Validate generated applications effortlessly within our isolated, containerized live-preview sandbox environment.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Documentation Section */}
      <section id="documentation" className="py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-4 flex items-center justify-center gap-2">
              <Beaker className="h-8 w-8 text-indigo-500" /> How to use AppForge
            </h2>
            <p className="text-muted-foreground text-lg">Follow this quick tutorial to generate your first application.</p>
          </div>

          <Accordion type="single" collapsible className="w-full space-y-4" defaultValue="step-1">
            <AccordionItem value="step-1" className="border bg-card px-6 py-2 rounded-lg shadow-sm">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">1</span>
                  Create a New Project
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pt-4 pb-6">
                <div className="space-y-6">
                  <p className="text-base leading-relaxed">
                    Begin by navigating to the Dashboard and clicking the <b>"New Project"</b> button in the top right corner. Give your project a descriptive name and summary.
                  </p>
                  <div className="rounded-xl overflow-hidden border shadow-sm">
                    <img
                      src="/docs/dashboard.png"
                      alt="AppForge Dashboard interface showing project list and New Project button"
                      className="w-full object-cover"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step-2" className="border bg-card px-6 py-2 rounded-lg shadow-sm">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">2</span>
                  Upload OpenAPI Specification
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pt-4 pb-6">
                <p className="text-base leading-relaxed">
                  Once inside your newly created project, upload a valid JSON or YAML <b>OpenAPI 3.0+ Specification</b>. This definition acts as the absolute source of truth that the AI will use to generate the React components, network layers, and forms.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step-3" className="border bg-card px-6 py-2 rounded-lg shadow-sm">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">3</span>
                  Enrich and Configure AI
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pt-4 pb-6">
                <div className="space-y-6">
                  <p className="text-base leading-relaxed">
                    AppForge parses your specification and displays all valid REST endpoints. You can inject custom instructions into specific API paths to forcefully guide the AI's rendering logic.
                    <br /><br />
                    Finally, select your target LLM in the Configuration panel. We strongly recommend using high-parameter models like <b>Claude 3.5 Sonnet</b> or <b>GPT-4o</b> for robust Next.js generation.
                  </p>
                  <div className="rounded-xl overflow-hidden border shadow-sm">
                    <img
                      src="/docs/editor.png"
                      alt="AppForge Project Interface showing parsed Swagger endpoints and AI Configuration settings"
                      className="w-full object-cover"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="step-4" className="border bg-card px-6 py-2 rounded-lg shadow-sm">
              <AccordionTrigger className="text-lg font-semibold hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold">4</span>
                  Generate, Preview, and Download
                </div>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pt-4 pb-6">
                <p className="text-base leading-relaxed">
                  Click <b>Generate Application</b>. AppForge will efficiently minify your spec to conserve tokens, compile an extensive system prompt covering complex framework routing rules, and execute the completion.
                  <br /><br />
                  Once finished, you can test the application dynamically via the built-in isolated sandbox preview. However, for a complete lag-free experience, it is heavily recommended to click <b>Download Code</b> and launch the repository natively via `npm run dev`.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/20 py-8">
        <div className="container flex justify-center text-center mx-auto px-4">
          <p className="text-sm text-muted-foreground">Built dynamically by AI context.</p>
        </div>
      </footer>
    </div>
  );
}
