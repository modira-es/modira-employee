import { router } from "./_core/trpc";
import { adminRouter } from "./routers/admin";

export const appRouter = router({
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;