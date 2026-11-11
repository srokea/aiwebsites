const express = require("express");
const {
  INTERESTED_OPTIONS,
  INTERESTED_DONUT_ORDER,
  ANSWERED_OPTIONS,
  PLATFORM_TAGS,
  PLATFORM_META,
  WEBSITE_STATUS_OPTIONS,
  QUALITY_OPTIONS,
  SITE_PROGRESS_OPTIONS,
  SMS_CONFIRM_TEMPLATE,
  TRANSACTION_CATEGORIES,
  NICHE_COLORS,
  DAILY_GOAL,
  LEAD_COLUMNS,
  CONTRACT_STATUS_OPTIONS,
  CONTRACT_KIND_OPTIONS,
  CONTRACT_VARIANT_OPTIONS,
  BILL_KIND_OPTIONS,
  CONTRACT_DAYS_THRESHOLDS,
  BUYOUT_DEFAULT,
} = require("../constants");
const { getCallers } = require("../callers");

const router = express.Router();

// Wszystkie listy wyboru i kolory dla frontu - jedno zrodlo prawdy (server/constants.js),
// oprocz callerow ktorzy pochodza z zywych kont (server/callers.js)
router.get("/", (req, res) => {
  const callers = getCallers();
  res.json({
    interestedOptions: INTERESTED_OPTIONS,
    donutOrder: INTERESTED_DONUT_ORDER,
    answeredOptions: ANSWERED_OPTIONS,
    callers: callers.map((c) => c.display_name),
    callerColors: Object.fromEntries(callers.map((c) => [c.display_name, c.color])),
    platformTags: PLATFORM_TAGS,
    platformMeta: PLATFORM_META,
    websiteStatusOptions: WEBSITE_STATUS_OPTIONS,
    qualityOptions: QUALITY_OPTIONS,
    siteProgressOptions: SITE_PROGRESS_OPTIONS,
    smsConfirmTemplate: SMS_CONFIRM_TEMPLATE,
    transactionCategories: TRANSACTION_CATEGORIES,
    nicheColors: NICHE_COLORS,
    dailyGoal: DAILY_GOAL,
    leadColumns: LEAD_COLUMNS,
    contractStatusOptions: CONTRACT_STATUS_OPTIONS,
    contractKindOptions: CONTRACT_KIND_OPTIONS,
    contractVariantOptions: CONTRACT_VARIANT_OPTIONS,
    billKindOptions: BILL_KIND_OPTIONS,
    contractDaysThresholds: CONTRACT_DAYS_THRESHOLDS,
    buyoutDefault: BUYOUT_DEFAULT,
  });
});

module.exports = router;
