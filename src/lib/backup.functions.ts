import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generarRespaldo } from "./backup.server";

export const exportarRespaldo = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ accessToken: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => generarRespaldo(data.accessToken));
