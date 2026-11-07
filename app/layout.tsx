import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Archivo } from "next/font/google";
import "./globals.css";
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
});
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
      className={archivo.variable}
      data-theme={theme === "dark" || theme === "light" ? theme : undefined}
    >
      <body>{children}</body>
    </html>
  );
}
