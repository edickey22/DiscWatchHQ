import { Router, type IRouter } from "express";
import healthRouter from "./health";
import releasesRouter from "./releases";
import publishersRouter from "./publishers";
import platformsRouter from "./platforms";
import subscribersRouter from "./subscribers";
import scrapeRouter from "./scrape";
import affiliateRouter from "./affiliate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(releasesRouter);
router.use(publishersRouter);
router.use(platformsRouter);
router.use(subscribersRouter);
router.use(scrapeRouter);
router.use(affiliateRouter);

export default router;
