import { auth } from "./auth";
export default auth((req) => {
  if (!req.auth) return Response.redirect(new URL("/api/auth/signin", req.url));
});
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
