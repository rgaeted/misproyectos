import { z } from "zod";
export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido.").max(254),
  password: z.string().min(1, "Escribe tu contraseña.").max(128, "Usa hasta 128 caracteres."),
});
export const registrationSchema = credentialsSchema.extend({
  name: z.string().trim().min(2, "Escribe tu nombre.").max(80, "Usa hasta 80 caracteres."),
  password: z.string().min(12, "Usa al menos 12 caracteres.").max(128, "Usa hasta 128 caracteres."),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"], message: "Las contraseñas no coinciden.",
});
