export type ActionResult<T = undefined> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string };

export function ok<T = undefined>(
  data: T = undefined as T,
  message?: string,
): ActionResult<T> {
  return { success: true, data, message };
}

export function fail(error: string): ActionResult<never> {
  return { success: false, error };
}
