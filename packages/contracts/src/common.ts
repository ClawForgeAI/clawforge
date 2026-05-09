import { z } from "zod";

export const Iso = z.iso.datetime();
export const Uuid = z.uuid();
export const OrgId = z.string().min(1);
export const UserId = z.string().min(1);

export const Outcome = z.enum(["allowed", "blocked", "error", "success"]);
export type Outcome = z.infer<typeof Outcome>;
