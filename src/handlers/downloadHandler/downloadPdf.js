const custom = require('@/controllers/pdfController');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

module.exports = downloadPdf = async (req, res, { directory, id }) => {
  try {
    const modelName = directory.slice(0, 1).toUpperCase() + directory.slice(1);
    
    if (!mongoose.models[modelName]) {
      return res.status(404).json({
        success: false,
        result: null,
        message: `Model '${modelName}' does not exist`,
      });
    }

    const Model = mongoose.model(modelName);
    const result = await Model.findOne({ _id: id }).exec();

    if (!result) {
      throw { name: 'ValidationError' };
    }

    // 生成 PDF 相关路径
    const fileId = `${modelName.toLowerCase()}-${result._id}.pdf`;
    const folderPath = modelName.toLowerCase();
    const targetLocation = `src/public/download/${folderPath}/${fileId}`;

    // 确保目录存在
    const folderDir = path.dirname(targetLocation);
    if (!fs.existsSync(folderDir)) {
      fs.mkdirSync(folderDir, { recursive: true });
    }

    // 生成 PDF
    await custom.generatePdf(
      modelName,
      { filename: folderPath, format: 'A4', targetLocation },
      result
    );

    // 发送文件
    return res.download(targetLocation, (error) => {
      if (error) {
        return res.status(500).json({
          success: false,
          result: null,
          message: "Couldn't find file",
          error: error.message,
        });
      }
    });

  } catch (error) {
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
