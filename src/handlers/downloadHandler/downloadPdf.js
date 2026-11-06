const custom = require('@/controllers/pdfController');
const { models } = require('@/db');
const fs = require('fs');
const path = require('path');

// Pug templates in src/pdf reference associations (model.client, model.items, …)
// that are not auto-loaded by Sequelize, so each PDF-capable model needs an
// explicit include list to avoid "Cannot read properties of undefined" at render time.
const pdfIncludes = {
  Invoice: () => [
    { model: models.Client, as: 'client' },
    { model: models.InvoiceItem, as: 'items' },
  ],
  Quote: () => [
    { model: models.Client, as: 'client' },
    { model: models.QuoteItem, as: 'items' },
  ],
  Payment: () => [
    { model: models.Client, as: 'client' },
  ],
};

module.exports = downloadPdf = async (req, res, { directory, id }) => {
  try {
    const modelName = directory.slice(0, 1).toUpperCase() + directory.slice(1);

    if (!models[modelName]) {
      return res.status(404).json({
        success: false,
        result: null,
        message: `Model '${modelName}' does not exist`,
      });
    }

    const Model = models[modelName];
    const include = pdfIncludes[modelName] ? pdfIncludes[modelName]() : undefined;
    const result = await Model.findOne({ where: { id }, include });

    if (!result) {
      throw { name: 'ValidationError' };
    }

    const fileId = `${modelName.toLowerCase()}-${result.id}.pdf`;
    const folderPath = modelName.toLowerCase();
    const targetLocation = path.resolve(
      process.cwd(),
      'src/public/download',
      folderPath,
      fileId
    );

    const folderDir = path.dirname(targetLocation);
    if (!fs.existsSync(folderDir)) {
      fs.mkdirSync(folderDir, { recursive: true });
    }

    await custom.generatePdf(
      modelName,
      { filename: folderPath, format: 'A4', targetLocation },
      result
    );

    return res.download(targetLocation, (error) => {
      if (error && !res.headersSent) {
        console.error('[downloadPdf] res.download failed', error);
        return res.status(500).json({
          success: false,
          result: null,
          message: "Couldn't find file",
          error: error.message,
        });
      }
    });

  } catch (error) {
    console.error('[downloadPdf] handler error', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        result: null,
        error: error.message,
        message: 'Required fields are not supplied',
      });
    } else if (error.name === 'BSONTypeError') {
      return res.status(400).json({
        success: false,
        result: null,
        error: error.message,
        message: 'Invalid ID',
      });
    } else {
      return res.status(500).json({
        success: false,
        result: null,
        error: error.message,
        message: error.message,
        controller: 'downloadPDF.js',
      });
    }
  }
};
