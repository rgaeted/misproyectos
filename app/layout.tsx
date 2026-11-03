import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
export const metadata: Metadata = {
  title: "Mis proyectos",
  description: "Un lugar para tus proyectos, próximos pasos e ideas.",
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = (await cookies()).get("theme")?.value;
  return (
    <html
      lang="es-CL"
      data-theme={theme === "dark" || theme === "light" ? theme : undefined}
    >
      <body>{children}</body>
    </html>
  );
}
