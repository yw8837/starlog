import { llmsTxt } from "@/lib/llms";

export const dynamic = "force-static";

/** /llms.txt (llmstxt.org): the service in citable statements and a map of its pages and guides. */
export function GET() {
  return new Response(llmsTxt(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
