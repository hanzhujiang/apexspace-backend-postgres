const pug = require('pug');
const fs = require('fs');
const moment = require('moment');
const puppeteer = require('puppeteer');
const { listAllSettings, loadSettings } = require('@/middlewares/settings');
const { getData } = require('@/middlewares/serverData');
const useLanguage = require('@/locale/useLanguage');
const { useMoney, useDate } = require('@/settings');

const pugFiles = ['invoice', 'offer', 'quote', 'payment'];

require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage', // prevents crashes in containers with small /dev/shm
  '--disable-gpu',
  '--no-zygote', // reduces subprocess count on Linux
];

let browserInstance = null;

async function getBrowser() {
  if (browserInstance) {
    try {
      // verify the existing browser is still responsive
      await browserInstance.version();
      return browserInstance;
    } catch {
      browserInstance = null;
    }
  }
  browserInstance = await puppeteer.launch({ args: BROWSER_ARGS });
  return browserInstance;
}

exports.generatePdf = async (
  modelName,
  info = { filename: 'pdf_file', format: 'A5', targetLocation: '' },
  result,
  callback
) => {
  try {
    const { targetLocation } = info;

    if (fs.existsSync(targetLocation)) {
      fs.unlinkSync(targetLocation);
    }

    if (pugFiles.includes(modelName.toLowerCase())) {
      const settings = await loadSettings();
      const selectedLang = settings['idurar_app_language'];
      const translate = useLanguage({ selectedLang });

      const {
        currency_symbol,
        currency_position,
        decimal_sep,
        thousand_sep,
        cent_precision,
        zero_format,
      } = settings;

      const { moneyFormatter } = useMoney({
        settings: {
          currency_symbol,
          currency_position,
          decimal_sep,
          thousand_sep,
          cent_precision,
          zero_format,
        },
      });
      const { dateFormat } = useDate({ settings });

      settings.public_server_file = process.env.PUBLIC_SERVER_FILE;

      // Serialize Sequelize instance to a plain object so Pug sees associations
      // as regular nested objects/arrays (toJSON walks children, including the
      // Mongo-id injection), instead of lazy getters that can surprise templates.
      const modelData = typeof result?.toJSON === 'function' ? result.toJSON() : result;

      const htmlContent = pug.renderFile('src/pdf/' + modelName + '.pug', {
        model: modelData,
        settings,
        translate,
        dateFormat,
        moneyFormatter,
        moment: moment,
      });

      const browser = await getBrowser();
      const page = await browser.newPage();

      try {
        // `networkidle0` waits for 500ms of no network activity, which never
        // resolves when the template references assets (e.g. the favicon link)
        // that puppeteer tries to fetch under about:blank. The template has no
        // dynamic content, so DOMContentLoaded is sufficient.
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        await page.pdf({
          path: targetLocation,
          format: info.format,
          printBackground: true,
          margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
        });
      } finally {
        await page.close();
      }

      if (callback) callback();
    }
  } catch (error) {
    console.error('[generatePdf] failed for', modelName, error);
    // Preserve the original error (stack + message) instead of stringifying it
    // through `new Error(error)`, so callers can see where it actually broke.
    throw error;
  }
};
