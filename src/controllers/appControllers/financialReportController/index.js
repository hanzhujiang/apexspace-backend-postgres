const { sequelize, models, Op } = require('@/db');

const defaultInclude = () => [
  { model: models.FinancialReportFile, as: 'files', required: false, where: { removed: false } },
];

const monthRange = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m) return null;
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
};

const buildWhere = (query) => {
  const where = { removed: false };
  if (query.company) where.company = query.company;
  const range = monthRange(query.year, query.month);
  if (range) {
    where.date = { [Op.gte]: range.start.toISOString().slice(0, 10), [Op.lt]: range.end.toISOString().slice(0, 10) };
  }
  return where;
};

const create = async (req, res) => {
  const { company, date, amount, currency, item, remarks } = req.body;
  if (!company || !date) {
    return res.status(400).json({ success: false, result: null, message: 'company and date are required' });
  }
  const row = await models.FinancialReport.create({
    company,
    date,
    amount: amount ?? 0,
    currency: currency || 'AUD',
    item: item || null,
    remarks: remarks || null,
    removed: false,
  });
  const full = await models.FinancialReport.findByPk(row.id, { include: defaultInclude() });
  return res.status(200).json({ success: true, result: full, message: 'Successfully Created' });
};

const read = async (req, res) => {
  const result = await models.FinancialReport.findOne({
    where: { id: req.params.id, removed: false },
    include: defaultInclude(),
  });
  if (!result) return res.status(404).json({ success: false, result: null, message: 'No document found' });
  return res.status(200).json({ success: true, result, message: 'Found' });
};

const update = async (req, res) => {
  const patch = {};
  ['company', 'date', 'amount', 'currency', 'item', 'remarks'].forEach((k) => {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  });
  patch.updated = new Date();
  const [count] = await models.FinancialReport.update(patch, { where: { id: req.params.id, removed: false } });
  if (!count) return res.status(404).json({ success: false, result: null, message: 'No document found' });
  const result = await models.FinancialReport.findByPk(req.params.id, { include: defaultInclude() });
  return res.status(200).json({ success: true, result, message: 'Updated' });
};

const remove = async (req, res) => {
  const [count] = await models.FinancialReport.update({ removed: true }, { where: { id: req.params.id } });
  if (!count) return res.status(404).json({ success: false, result: null, message: 'No document found' });
  const result = await models.FinancialReport.findByPk(req.params.id);
  return res.status(200).json({ success: true, result, message: 'Deleted' });
};

// list honors optional ?company, ?year, ?month, and pagination.
const list = async (req, res) => {
  const page   = parseInt(req.query.page)  || 1;
  const limit  = parseInt(req.query.items) || 50;
  const offset = (page - 1) * limit;
  const where = buildWhere(req.query);

  const { rows: result, count } = await models.FinancialReport.findAndCountAll({
    where,
    include: defaultInclude(),
    offset,
    limit,
    order: [['date', 'ASC'], ['id', 'ASC']],
  });

  const pagination = { page, pages: Math.ceil(count / limit), count };
  if (count > 0) {
    return res.status(200).json({ success: true, result, pagination, message: 'Found' });
  }
  return res.status(203).json({ success: true, result: [], pagination, message: 'Empty' });
};

// listAll — all rows for the filter (used by the page which paginates client-side).
const listAll = async (req, res) => {
  const where = buildWhere(req.query);
  const result = await models.FinancialReport.findAll({
    where,
    include: defaultInclude(),
    order: [['date', 'ASC'], ['id', 'ASC']],
  });
  return res.status(200).json({ success: true, result, message: 'Found' });
};

// Per-company running total across all months, grouped by currency.
// Deliberately ignores year/month — the balance is company-scoped, not
// filter-scoped, so switching the month picker leaves it unchanged.
const balance = async (req, res) => {
  const where = { removed: false };
  if (req.query.company) where.company = req.query.company;
  const rows = await models.FinancialReport.findAll({
    where,
    attributes: [
      'currency',
      [sequelize.fn('SUM', sequelize.col('amount')), 'total'],
    ],
    group: ['currency'],
    raw: true,
  });
  const result = { AUD: 0, CNY: 0 };
  rows.forEach((r) => { result[r.currency] = Number(r.total) || 0; });
  return res.status(200).json({ success: true, result, message: 'Found' });
};

const search = async (_req, res) => res.status(200).json({ success: true, result: [], message: 'Not supported' });
const filter = async (_req, res) => res.status(200).json({ success: true, result: [], message: 'Not supported' });
const summary = async (_req, res) => res.status(200).json({ success: true, result: { countFilter: 0, countAllDocs: 0 }, message: 'Not supported' });

// Append uploaded files to a report. Called from the custom
// /financial-report/upload/:id route in appApi.js once multer has parsed `files[]`.
const attachUploadedFiles = async (reportId, uploadedFiles) => {
  if (!uploadedFiles?.length) return [];
  const rows = uploadedFiles.map((f) => ({
    financial_report_id: reportId,
    fileId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: f.originalname,
    path: `public/uploads/financial-report/${f.filename}`,
    isPublic: true,
    removed: false,
  }));
  await models.FinancialReportFile.bulkCreate(rows);
  return models.FinancialReportFile.findAll({
    where: { financial_report_id: reportId, removed: false },
  });
};

// Soft-delete a single attached file.
const deleteFile = async (req, res) => {
  const [count] = await models.FinancialReportFile.update(
    { removed: true },
    { where: { id: req.params.fileId, financial_report_id: req.params.id } }
  );
  if (!count) return res.status(404).json({ success: false, result: null, message: 'File not found' });
  const result = await models.FinancialReport.findByPk(req.params.id, { include: defaultInclude() });
  return res.status(200).json({ success: true, result, message: 'File removed' });
};

// Download a CSV for the current filter (company + year + month).
const csvEscape = (v) => {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const exportCsv = async (req, res) => {
  const where = buildWhere(req.query);
  const rows = await models.FinancialReport.findAll({
    where,
    include: defaultInclude(),
    order: [['date', 'ASC'], ['id', 'ASC']],
  });

  const header = ['No', 'Date', 'Amount', 'Currency', 'Item', 'Remarks', 'Files'];
  const lines = [header.map(csvEscape).join(',')];
  rows.forEach((r, i) => {
    const plain = r.toJSON();
    const files = (plain.files || []).map((f) => f.name).join('; ');
    lines.push([
      i + 1,
      plain.date,
      plain.amount,
      plain.currency,
      plain.item || '',
      plain.remarks || '',
      files,
    ].map(csvEscape).join(','));
  });
  const csv = '﻿' + lines.join('\n');

  const company = req.query.company || 'all';
  const period = req.query.year && req.query.month
    ? `${req.query.year}-${String(req.query.month).padStart(2, '0')}`
    : 'all';
  const filename = `financial-report_${company}_${period}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.status(200).send(csv);
};

module.exports = {
  create,
  read,
  update,
  delete: remove,
  list,
  listAll,
  search,
  filter,
  summary,
  attachUploadedFiles,
  deleteFile,
  exportCsv,
  balance,
};
