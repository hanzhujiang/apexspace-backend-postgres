const { KOGAN_SHIPPING_MATRIX, KOGAN_SKU_WEIGHTS } = require('./koganConstants');

function postcodeInZone(postcode, postcodeStr) {
  const tokens = String(postcodeStr).split(',').map((t) => t.trim());
  for (const token of tokens) {
    if (token.includes('-')) {
      const [start, end] = token.split('-').map(Number);
      if (postcode >= start && postcode <= end) return true;
    } else {
      if (postcode === Number(token)) return true;
    }
  }
  return false;
}

// skuWeightMap is optional; falls back to the static constant if not provided.
function koganShippingPriceCalculator(sku, deliveryPostCode, skuWeightMap) {
  const weights = skuWeightMap || KOGAN_SKU_WEIGHTS;
  const weight = weights[sku];
  if (weight === undefined) {
    throw new Error(`Unknown SKU in weight table: ${sku}`);
  }

  const postcode = parseInt(String(deliveryPostCode).trim(), 10);
  if (isNaN(postcode)) {
    throw new Error(`Invalid postcode: ${deliveryPostCode}`);
  }

  for (const zone of KOGAN_SHIPPING_MATRIX) {
    if (postcodeInZone(postcode, zone.postcodes)) {
      const price = weight * zone.perKiloCharge + zone.baseCharge;
      return Math.round(price * 100) / 100;
    }
  }

  throw new Error(`No shipping zone found for postcode: ${postcode}`);
}

module.exports = { koganShippingPriceCalculator };
