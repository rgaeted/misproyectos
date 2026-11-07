import { z } from "zod";
import { stages } from "./stages";
import { stepStates } from "./steps";
export const shortText = z
  .string()
  .trim()
  .min(1, "Escribe un texto.")
  .max(120, "Usa hasta 120 caracteres.");
export const content = z
  .string()
  .trim()
  .min(1, "Escribe un texto.")
  .max(2000, "Usa hasta 2000 caracteres.");
export const githubUrl = z
  .string()
  .trim()
  .max(2000, "Usa hasta 2000 caracteres.")
  .transform((input, ctx) => {
    const match =
      /^https:\/\/github\.com\/([\w-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(input);
    if (!match || match[2] === "." || match[2] === "..") {
      ctx.addIssue({
        code: "custom",
        message:
          "Pega un link que empiece con https://github.com/ e incluya dueño y repositorio.",
      });
      return z.NEVER;
    }
    return { owner: match[1].toLowerCase(), name: match[2].toLowerCase() };
  });
export const projectPatch = z
  .object({
    name: shortText.optional(),
    type: z.string().trim().max(120).optional(),
    stage: z.enum(stages).nullable().optional(),
    lastUpdate: z.string().max(2000).optional(),
    noRepoNote: z.string().max(2000).nullable().optional(),
    externalUrl: z
      .union([
        z.literal(""),
        z
          .url()
          .max(2000)
          .refine((v) => /^https?:/.test(v), "Usa un enlace http o https."),
      ])
      .nullable()
      .optional(),
    archived: z.boolean().optional(),
  })
  .strict();
export const command = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("addStep"), projectId: z.string().min(1).max(160), text: content,
    state: z.enum(stepStates).default("todo"),
    waitingOn: z.string().trim().max(500).default(""),
  }).refine((value) => value.state === "waiting" || !value.waitingOn, { message: "Solo los pasos en espera pueden indicar qué falta." }),
  z.object({
    op: z.literal("editStep"), id: z.uuid(), text: content.optional(),
    state: z.enum(stepStates).optional(), waitingOn: z.string().trim().max(500).optional(),
  }).refine((value) => value.text !== undefined || value.state !== undefined || value.waitingOn !== undefined, { message: "Indica qué quieres cambiar." }),
  z.object({ op: z.literal("removeStep"), id: z.uuid() }),
  z.object({ op: z.literal("reorderSteps"), projectId: z.string().min(1).max(160), ids: z.array(z.uuid()).max(500) }),
  z.object({ op: z.literal("create"), name: shortText }),
  z.object({
    op: z.literal("update"),
    id: z.string().min(1).max(160),
    patch: projectPatch,
  }),
  z.object({ op: z.literal("delete"), id: z.string().min(1).max(160) }),
  z.object({
    op: z.literal("addItem"),
    projectId: z.string().min(1).max(160),
    kind: z.enum(["status", "idea", "question"]),
    text: content,
  }),
  z.object({
    op: z.literal("editItem"),
    id: z.uuid(),
    text: content.optional(),
    done: z.boolean().optional(),
  }),
  z.object({ op: z.literal("removeItem"), id: z.uuid() }),
  z.object({
    op: z.literal("reorder"),
    projectId: z.string().min(1).max(160),
    kind: z.enum(["status", "idea", "question"]),
    ids: z.array(z.uuid()).max(500),
  }),
  z.object({
    op: z.literal("addRepo"),
    projectId: z.string().min(1).max(160),
    url: githubUrl,
  }),
  z.object({ op: z.literal("removeRepo"), id: z.uuid() }),
  z.object({ op: z.literal("capture"), text: content }),
  z.object({ op: z.literal("removeInbox"), id: z.uuid() }),
  z.object({ op: z.literal("convert"), id: z.uuid() }),
  z.object({ op: z.literal("refresh"), projectId: z.string().min(1).max(160) }),
]);
export type CommandInput = z.input<typeof command>;
