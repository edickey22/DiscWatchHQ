import { Router, type IRouter } from "express";
import healthRouter from "./health";
import releasesRouter from "./releases";
import publishersRouter from "./publishers";
import platformsRouter from "./platforms";
import subscribersRouter from "./subscribers";
import scrapeRouter from "./scrape";
import affiliateRouter from "./affiliate";
import gamesRouter from "./games";
import catalogRouter from "./catalog";
import seoRouter from "./seo";
import socialRouter from "./social";
import consolesRouter from "./consoles";

const router: IRouter = Router();

router.use(socialRouter);
router.use(healthRouter);
router.use(releasesRouter);
router.use(publishersRouter);
router.use(platformsRouter);
router.use(subscribersRouter);
router.use(scrapeRouter);
router.use(affiliateRouter);
router.use(gamesRouter);
router.use(catalogRouter);
router.use(seoRouter);
router.use(consolesRouter);

export default router;
