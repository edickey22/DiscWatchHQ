import { Router, type IRouter } from "express";
import { affiliateConfig } from "../lib/affiliateConfig";

const router: IRouter = Router();

/**
 * GET /affiliate/config
 * Returns which affiliate channels are configured — without exposing the actual IDs.
 * The frontend uses this to decide whether to show "monetized" vs plain link labels.
 */
router.get("/affiliate/config", (_req, res): void => {
  res.json({
    ebay: {
      configured: !!affiliateConfig.ebay.campaignId,
    },
    amazon: {
      configured: !!affiliateConfig.amazon.associatesTag,
    },
  });
});

export default router;
