const express = require("express");
const {
  INTERESTED_OPTIONS,
  INTERESTED_DONUT_ORDER,
  ANSWERED_OPTIONS,
  CALLERS,
  CALLER_COLORS,
  PLATFORM_TAGS,
  PLATFORM_META,
  WEBSITE_STATUS_OPTIONS,
  NICHE_COLORS,
  DAILY_GOAL,
} = require("../constants");

const router = express.Router();

// Wszystkie listy wyboru i kolory dla frontu - jedno zrodlo prawdy (server/constants.js)
router.get("/", (req, res) => {
  res.json({
    interestedOptions: INTERESTED_OPTIONS,
    donutOrder: INTERESTED_DONUT_ORDER,
    answeredOptions: ANSWERED_OPTIONS,
    callers: CALLERS,
    callerColors: CALLER_COLORS,
    platformTags: PLATFORM_TAGS,
    platformMeta: PLATFORM_META,
    websiteStatusOptions: WEBSITE_STATUS_OPTIONS,
    nicheColors: NICHE_COLORS,
    dailyGoal: DAILY_GOAL,
  });
});

module.exports = router;
