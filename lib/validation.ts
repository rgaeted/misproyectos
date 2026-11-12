import { z } from "zod";
import { stages } from "./stages";
import { stepStates } from "./steps";
import { planKinds } from "./payments";
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
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Usa una fecha válida.")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }, "Usa una fecha válida.");
const amountUf = z
  .number("Usa un monto en UF mayor que 0, con hasta 2 decimales.")
  .refine(
    (value) => value > 0 && value <= 100000 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6,
    "Usa un monto en UF mayor que 0, con hasta 2 decimales.",
  );
const installmentCount = z.number().int("Indica entre 2 y 120 cuotas.").min(2, "Indica entre 2 y 120 cuotas.").max(120, "Indica entre 2 y 120 cuotas.");
const seq = z.number().int().min(0).max(10000);
export const command = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("confirmDayList"),
    items: z.array(z.union([z.object({ stepId: z.uuid() }), z.object({ text: content })])).max(100, "Usa hasta 100 ítems."),
  }),
  z.object({ op: z.literal("toggleDayItem"), id: z.uuid(), done: z.boolean() }),
  z.object({
    op: z.literal("addPlan"), projectId: z.string().min(1).max(160), concept: shortText,
    kind: z.enum(planKinds), amountUf, startDate: dateString, installments: installmentCount.optional(),
  }).superRefine((value, ctx) => {
    if (value.kind === "installments" && value.installments === undefined)
      ctx.addIssue({ code: "custom", path: ["installments"], message: "Indica entre 2 y 120 cuotas." });
    if (value.kind !== "installments" && value.installments !== undefined)
      ctx.addIssue({ code: "custom", path: ["installments"], message: "Solo los planes en cuotas indican cuántas son." });
  }),
  z.object({
    op: z.literal("editPlan"), id: z.uuid(), concept: shortText.optional(), amountUf: amountUf.optional(),
    startDate: dateString.optional(), installments: installmentCount.optional(), endDate: dateString.nullable().optional(),
  }).refine(
    (value) => value.concept !== undefined || value.amountUf !== undefined || value.startDate !== undefined || value.installments !== undefined || value.endDate !== undefined,
    { message: "Indica qué quieres cambiar." },
  ),
  z.object({ op: z.literal("deletePlan"), id: z.uuid() }),
  z.object({ op: z.literal("markPaid"), planId: z.uuid(), seq }),
  z.object({ op: z.literal("unmarkPaid"), planId: z.uuid(), seq }),
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
  z.object({ op: z.literal("startTimer"), projectId: z.string().min(1).max(160) }),
  z.object({
    op: z.literal("setTimerTask"), projectId: z.string().min(1).max(160),
    stepId: z.uuid().optional(), text: content.optional(),
  }).refine((value) => (value.stepId === undefined) !== (value.text === undefined), { message: "Elige un paso o escribe una tarea." }),
  z.object({ op: z.literal("stopTimer"), projectId: z.string().min(1).max(160) }),
  z.object({
    op: z.literal("addTimeEntry"), projectId: z.string().min(1).max(160),
    startedAt: z.iso.datetime(), endedAt: z.iso.datetime(), stepId: z.uuid().nullable().optional(),
  }),
  z.object({
    op: z.literal("editTimeEntry"), id: z.uuid(),
    startedAt: z.iso.datetime().optional(), endedAt: z.iso.datetime().optional(), stepId: z.uuid().nullable().optional(),
  }).refine((value) => value.startedAt !== undefined || value.endedAt !== undefined || value.stepId !== undefined, { message: "Indica qué quieres cambiar." }),
  z.object({ op: z.literal("removeTimeEntry"), id: z.uuid() }),
]);
export type CommandInput = z.input<typeof command>;
