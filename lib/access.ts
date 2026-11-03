export function isAllowedLogin(login: unknown, allowed: string | undefined) {
  return (
    typeof login === "string" &&
    Boolean(allowed) &&
    login.toLowerCase() === allowed?.toLowerCase()
  );
}
