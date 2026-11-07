import { z } from "zod";
export function isUserId(value: unknown): value is string {
  return z.uuid().safeParse(value).success;
}
