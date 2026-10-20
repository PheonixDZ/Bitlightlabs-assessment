const asyncErrorHandler = require("../middlewares/helpers/asyncErrorHandler");
const { getOnchainSummary, readErc20 } = require("../utils/darpanContractReader");

exports.getDarpanApitest = asyncErrorHandler(async (req, res) => {
  const summary = await getOnchainSummary();
  console.log("[DarpanApitest] on-chain summary:", JSON.stringify(summary, null, 2));
  res.status(200).json({
    success: true,
    api: "DarpanApitest",
    ...summary,
  });
});

exports.getDarpanApitestToken = asyncErrorHandler(async (req, res) => {
  const token = await readErc20(req.params.address);
  console.log(`[DarpanApitest] ERC-20 ${token.symbol} totalSupply=${token.totalSupply} @ block ${token.blockNumber}`);
  res.status(200).json({
    success: true,
    api: "DarpanApitest",
    token,
  });
});
