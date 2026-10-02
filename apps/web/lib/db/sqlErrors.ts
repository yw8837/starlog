/** A UNIQUE, CHECK, NOT NULL or FOREIGN KEY failure. D1 ("D1_ERROR: … constraint failed") and SQLite both say "constraint failed". */
export function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint failed/i.test(error.message);
}
