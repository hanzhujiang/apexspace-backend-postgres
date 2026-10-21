const mongoose = require('mongoose');
const { KOGAN_SKU_WEIGHTS } = require('./koganConstants');

const KoganSkuWeight = mongoose.model('KoganSkuWeight');

const koganSeedWeights = async (req, res) => {
  const now = new Date();
  let inserted = 0;
  let skipped = 0;

  for (const [sku, weight] of Object.entries(KOGAN_SKU_WEIGHTS)) {
    const exists = await KoganSkuWeight.findOne({ sku, removed: false }).lean();
    if (!exists) {
      await new KoganSkuWeight({ sku, weight, removed: false, created: now, updated: now }).save();
      inserted++;
    } else {
      skipped++;
    }
  }

  return res.status(200).json({
    success: true,
    message: `Seeded ${inserted} SKU weight(s). ${skipped} already existed.`,
    result: { inserted, skipped },
  });
};

module.exports = koganSeedWeights;
