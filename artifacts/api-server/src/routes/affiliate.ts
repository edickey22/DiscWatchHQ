import { Router, type IRouter } from "express";
import { affiliateConfig } from "../lib/affiliateConfig";

const router: IRouter = Router();

/**
 * GET /affiliate/config
 * Returns which affiliate channels are configured — without exposing the actual IDs.
 */
router.get("/affiliate/config", (_req, res): void => {
  res.json({
    ebay:     { configured: !!affiliateConfig.ebay.campaignId },
    amazon:   { configured: !!affiliateConfig.amazon.associatesTag },
    gamestop: { configured: !!affiliateConfig.gamestop.affiliateId },
    bestbuy:  { configured: !!affiliateConfig.bestbuy.affiliateId },
  });
});

export default router;
