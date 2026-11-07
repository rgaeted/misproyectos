import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { hashPassword, verifyPassword } from "../lib/passwords";
import { registrationSchema, credentialsSchema } from "../lib/credentials";
import { encryptToken, decryptToken } from "../lib/token-storage";

describe("cuentas y contraseñas", () => {
  it("genera hashes distintos y rechaza contraseñas incorrectas o cuentas inexistentes", async () => {
    const a = await hashPassword("Una frase suficientemente larga");
    const b = await hashPassword("Una frase suficientemente larga");
    expect(a).not.toBe(b);
    expect(a).not.toContain("suficientemente");
    expect(await verifyPassword("Una frase suficientemente larga", a)).toBe(true);
    expect(await verifyPassword("Otra contraseña", a)).toBe(false);
    expect(await verifyPassword("Otra contraseña", null)).toBe(false);
    expect(await verifyPassword("Otra contraseña", "invalid")).toBe(false);
  });
  it("valida correo, longitud y confirmación sin recortar la contraseña", () => {
    expect(registrationSchema.safeParse({ name: "Ana", email: "ana@example.com", password: "corta", confirmPassword: "corta" }).success).toBe(false);
    expect(registrationSchema.safeParse({ name: "Ana", email: "ana@example.com", password: "contraseña larga", confirmPassword: "otra contraseña" }).success).toBe(false);
    expect(credentialsSchema.parse({ email: "ANA@EXAMPLE.COM", password: " frase con espacios " })).toEqual({ email: "ana@example.com", password: " frase con espacios " });
  });
});
describe("credenciales de GitHub", () => {
  it("cifra tokens y detecta alteraciones y claves incorrectas", () => {
    vi.stubEnv("AUTH_SECRET", "clave de prueba de cifrado");
    const encrypted = encryptToken("token-privado");
    expect(encrypted).not.toContain("token-privado");
    expect(decryptToken(encrypted)).toBe("token-privado");
    const changed = Buffer.from(encrypted, "base64");
    changed[30] ^= 1;
    expect(() => decryptToken(changed.toString("base64"))).toThrow();
    vi.stubEnv("AUTH_SECRET", "otra clave de prueba");
    expect(() => decryptToken(encrypted)).toThrow();
    vi.unstubAllEnvs();
  });
});
