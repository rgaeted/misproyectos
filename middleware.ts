import { auth } from "./auth";
import { isUserId } from "./lib/access";
export default auth((req) => {
  if (!isUserId(req.auth?.user?.id)) return Response.redirect(new URL("/login", req.url));
});
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!login(?:/|$)|register(?:/|$)|api/auth|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
