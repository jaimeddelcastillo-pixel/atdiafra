import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createManagedUserAccount,
  deleteManagedUserAccount,
  getManagedUsers,
  inviteManagedUserAccount,
  sendManagedUserPasswordRecoveryEmail,
  setManagedUserPasswordAccount,
  updateManagedUserAccountRole,
} from "./admin-users.server";


export type { AdminRole, AdminUserView } from "./admin-users.server";

const roleSchema = z.enum(["super_admin", "admin", "editor", "viewer"]);
const tokenSchema = z.object({ accessToken: z.string().min(1) });

export const listManagedUsers = createServerFn({ method: "POST" })
  .inputValidator((data) => tokenSchema.parse(data))
  .handler(async ({ data }) => getManagedUsers(data.accessToken));

export const createManagedUser = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    tokenSchema
      .extend({
        email: z.string().email(),
        password: z.string().min(8),
        role: roleSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => createManagedUserAccount(data.accessToken, data));

export const inviteManagedUser = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    tokenSchema
      .extend({
        email: z.string().email(),
        role: roleSchema,
        redirectTo: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => inviteManagedUserAccount(data.accessToken, data));

export const updateManagedUserRole = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    tokenSchema
      .extend({
        userId: z.string().uuid(),
        role: roleSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => updateManagedUserAccountRole(data.accessToken, data));

export const deleteManagedUser = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    tokenSchema
      .extend({
        userId: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => deleteManagedUserAccount(data.accessToken, data));

export const setManagedUserPassword = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    tokenSchema
      .extend({
        userId: z.string().uuid(),
        password: z.string().min(8),
      })
      .parse(data),
  )
  .handler(async ({ data }) => setManagedUserPasswordAccount(data.accessToken, data));


export const sendManagedUserPasswordRecovery = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    tokenSchema
      .extend({
        email: z.string().email(),
        redirectTo: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { sendManagedUserPasswordRecoveryEmail } = await import("./admin-users.server");
    return sendManagedUserPasswordRecoveryEmail(data.accessToken, data);
  });
