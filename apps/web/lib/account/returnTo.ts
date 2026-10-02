/** Paths a login or a payment may come back to: this site only, no "//", no backslashes, 200 characters at most. */
const RETURN_TO = /^\/(?![/\\])[A-Za-z0-9\-._~/]*(\?[A-Za-z0-9\-._~=&%]*)?$/;

export function safeReturnTo(value: string | null | undefined): string {
  return value && value.length <= 200 && RETURN_TO.test(value) ? value : "/";
}

/** `path` with `query` merged into its search string (values encoded). */
export function withQuery(path: string, query: Record<string, string>): string {
  const [base = "/", search = ""] = path.split("?");
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(query)) params.set(key, value);
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}
