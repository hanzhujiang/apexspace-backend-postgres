const { models } = require('@/db');
const { KOGAN_SKU_WEIGHTS } = require('./koganConstants');

const KoganSkuWeight = models.KoganSkuWeight;

const koganSeedWeights = async (req, res) => {
  const now = new Date();
  const skus = Object.keys(KOGAN_SKU_WEIGHTS);

  const existing = await KoganSkuWeight.findAll({
    where: { removed: false },
    attributes: ['sku'],
    raw: true,
  });
  const existingSkus = new Set(existing.map((e) => e.sku));

  const toInsert = skus
    .filter((sku) => !existingSkus.has(sku))
    .map((sku) => ({
      sku,
      weight: KOGAN_SKU_WEIGHTS[sku],
      removed: false,
      created: now,
      updated: now,
    }));

  if (toInsert.length > 0) {
    await KoganSkuWeight.bulkCreate(toInsert, { ignoreDuplicates: true });
  }

  const inserted = toInsert.length;
  const skipped = skus.length - inserted;

  return res.status(200).json({
    success: true,
    message: `Seeded ${inserted} SKU weight(s). ${skipped} already existed.`,
    result: { inserted, skipped },
  });
};

module.exports = koganSeedWeights;
