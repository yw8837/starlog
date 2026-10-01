/** The build this Worker serves, for stale-tab detection (components/layout/VersionCheck). */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ build: process.env.NEXT_PUBLIC_BUILD_ID || null }, { headers: { "cache-control": "no-store" } });
}
