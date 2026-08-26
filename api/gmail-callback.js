import insuranceAutomationHandler from "../server/insurance-automation.js";

export default function handler(req, res) {
  req.query = { ...(req.query || {}), action: "insurance_oauth_callback" };
  return insuranceAutomationHandler(req, res);
}
