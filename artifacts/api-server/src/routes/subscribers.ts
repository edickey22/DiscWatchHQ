import { Router, type IRouter } from "express";
import { db, subscribersTable } from "@workspace/db";
import { CreateSubscriberBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/subscribers", async (req, res): Promise<void> => {
  const parsed = CreateSubscriberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.toLowerCase().trim();

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  // Check for existing subscription
  const [existing] = await db
    .select({ id: subscribersTable.id })
    .from(subscribersTable)
    .where(eq(subscribersTable.email, email))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "This email is already subscribed" });
    return;
  }

  await db.insert(subscribersTable).values({ email });

  res.status(201).json({ message: "You're on the list — first to know about every drop." });
});

export default router;
