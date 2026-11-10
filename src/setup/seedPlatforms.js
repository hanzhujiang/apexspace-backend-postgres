const { models } = require('@/db');

const DEFAULT_PLATFORMS = [
  { name: 'MyDeal',          fee_rate: 0.8450, fee_fixed: 0.00, color: '#5470c6', sort_order: 1, enabled: true  },
  { name: 'Amazon',          fee_rate: 0.8700, fee_fixed: 0.00, color: '#91cc75', sort_order: 2, enabled: true  },
  { name: 'Kogan',           fee_rate: 0.8610, fee_fixed: 0.00, color: '#fac858', sort_order: 3, enabled: true  },
  { name: 'Bunnings',        fee_rate: 0.8500, fee_fixed: 0.00, color: '#ee6666', sort_order: 4, enabled: true  },
  { name: 'Shopify',         fee_rate: 0.9825, fee_fixed: 0.30, color: '#73c0de', sort_order: 5, enabled: true  },
  { name: 'eBay',            fee_rate: 1.0000, fee_fixed: 0.00, color: '#3ba272', sort_order: 6, enabled: false },
  { name: 'Amazon-Dkovnck',  fee_rate: 1.0000, fee_fixed: 0.00, color: '#9a60b4', sort_order: 7, enabled: false },
];

async function seedPlatforms() {
  let created = 0;
  for (const row of DEFAULT_PLATFORMS) {
    const [, wasCreated] = await models.Platform.findOrCreate({
      where: { name: row.name },
      defaults: row,
    });
    if (wasCreated) created++;
  }
  return { total: DEFAULT_PLATFORMS.length, created };
}

module.exports = { seedPlatforms, DEFAULT_PLATFORMS };
