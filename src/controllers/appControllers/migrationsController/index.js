const fs = require('fs');
const path = require('path');
const { sequelize } = require('@/db');

// Owner-only. Lists and executes .sql files bundled in src/migration/.
// The dropdown on the client is populated from `list`; `run` validates the
// filename against the directory contents before executing, so a client can't
// supply an arbitrary path.

const MIGRATION_DIR = path.join(__dirname, '..', '..', '..', 'migration');

function isOwner(req) {
  return req && req.admin && req.admin.role === 'owner';
}

function denyUnlessOwner(req, res) {
  if (!isOwner(req)) {
    res.status(403).json({ success: false, result: null, message: 'Owner role required.' });
    return true;
  }
  return false;
}

// Read all .sql files currently on disk. Returns their basenames only — the
// caller never sees an absolute path.
function listSqlFiles() {
  if (!fs.existsSync(MIGRATION_DIR)) return [];
  return fs
    .readdirSync(MIGRATION_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function appliedNames() {
  // schema_migrations is created lazily by any migration that uses the marker
  // pattern (see cost_aud_total_cost.sql). If it hasn't been created yet,
  // return an empty set instead of surfacing a "relation does not exist" error.
  try {
    const rows = await sequelize.query(
      'SELECT name FROM schema_migrations',
      { type: sequelize.QueryTypes.SELECT }
    );
    return new Set(rows.map((r) => r.name));
  } catch (err) {
    return new Set();
  }
}

const list = async (req, res) => {
  if (denyUnlessOwner(req, res)) return;

  const files = listSqlFiles();
  const applied = await appliedNames();

  const result = files.map((name) => {
    const stat = fs.statSync(path.join(MIGRATION_DIR, name));
    // Convention: files that use the schema_migrations marker insert a row
    // whose name matches the file basename without the .sql suffix. Surface
    // that status so the UI can show which have run.
    const marker = name.replace(/\.sql$/, '');
    return {
      name,
      sizeBytes: stat.size,
      modified: stat.mtime,
      appliedMarker: [...applied].find((m) => m === marker || m.startsWith(marker)) || null,
    };
  });

  return res.status(200).json({
    success: true,
    result,
    message: 'Available migrations',
  });
};

const run = async (req, res) => {
  if (denyUnlessOwner(req, res)) return;

  const rawName = String(req.body?.name || '').trim();
  if (!rawName) {
    return res
      .status(400)
      .json({ success: false, result: null, message: 'Migration name is required.' });
  }

  // Lock to basename + .sql extension and require membership of the live
  // directory listing. Anything with path separators, '..', or missing from the
  // listing is rejected before we touch the filesystem.
  const name = path.basename(rawName);
  if (name !== rawName || !name.endsWith('.sql')) {
    return res
      .status(400)
      .json({ success: false, result: null, message: 'Invalid migration name.' });
  }
  const files = listSqlFiles();
  if (!files.includes(name)) {
    return res
      .status(404)
      .json({ success: false, result: null, message: `Migration not found: ${name}` });
  }

  const filePath = path.join(MIGRATION_DIR, name);
  const sql = fs.readFileSync(filePath, 'utf8');

  const startedAt = new Date();
  try {
    // Wrap in a transaction so partial failures don't leave the DB mid-change.
    // The SQL file may already use its own `DO $$ ... $$` guards (as the
    // cost_aud migration does) — the outer transaction is still safe because
    // PL/pgSQL DO blocks run inside the surrounding transaction.
    const result = await sequelize.transaction(async (t) => {
      return sequelize.query(sql, { transaction: t });
    });

    // sequelize.query returns driver-specific shapes for raw SQL; we don't
    // forward them verbatim (they can include sensitive internals). Instead
    // echo back a small summary.
    const durationMs = Date.now() - startedAt.getTime();
    const applied = await appliedNames();
    const marker = name.replace(/\.sql$/, '');
    const didMark = [...applied].find((m) => m === marker || m.startsWith(marker)) || null;

    return res.status(200).json({
      success: true,
      result: {
        name,
        durationMs,
        appliedMarker: didMark,
        rawCommandCount: Array.isArray(result) ? result.length : 1,
      },
      message: `Migration ${name} executed`,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      result: null,
      message: `Migration failed: ${err.message}`,
    });
  }
};

module.exports = { list, run };
