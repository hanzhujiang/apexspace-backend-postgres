const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { models, Op } = require('@/db');

const IDLE_SPLIT_MS = 15 * 60 * 1000; // 15min idle gap → new session row

// Audit-trail touch: bump lastActiveAt or start a new session row on idle.
// Fire-and-forget — never block the request.
async function touchUserSession(token, adminId, req) {
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const session = await models.UserSession.findOne({
      where: { tokenHash, endedAt: null },
      order: [['lastActiveAt', 'DESC']],
    });
    if (!session) {
      await models.UserSession.create({
        admin_id: adminId, startedAt: now, lastActiveAt: now, tokenHash,
        ipAddress: req.ip, userAgent: req.get && req.get('user-agent'),
      });
      return;
    }
    if (now - new Date(session.lastActiveAt).getTime() > IDLE_SPLIT_MS) {
      await session.update({ endedAt: session.lastActiveAt });
      await models.UserSession.create({
        admin_id: session.admin_id, startedAt: now, lastActiveAt: now, tokenHash,
        ipAddress: req.ip, userAgent: req.get && req.get('user-agent'),
      });
    } else {
      await session.update({ lastActiveAt: now });
    }
  } catch (err) {
    console.error('UserSession touch failed:', err.message);
  }
}

const isValidAuthToken = async (req, res, next, { userModel }) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, result: null, message: 'No authentication token, authorization denied.', jwtExpired: true });
    }

    const verified = jwt.verify(token, process.env.JWT_SECRET);
    if (!verified) {
      return res.status(401).json({ success: false, result: null, message: 'Token verification failed.', jwtExpired: true });
    }

    const [admin, adminPassword] = await Promise.all([
      models.Admin.findOne({ where: { id: verified.id, removed: false } }),
      models.AdminPassword.findOne({ where: { admin_id: verified.id, removed: false } }),
    ]);

    if (!admin) {
      return res.status(401).json({ success: false, result: null, message: "User doesn't exist.", jwtExpired: true });
    }

    const session = await models.AdminSession.findOne({
      where: { admin_password_id: adminPassword.id, token },
    });

    if (!session) {
      return res.status(401).json({ success: false, result: null, message: 'Session expired. Please log in again.', jwtExpired: true });
    }

    req.admin = admin;
    touchUserSession(token, admin.id, req);
    next();
  } catch (error) {
    return res.status(500).json({ success: false, result: null, message: error.message, jwtExpired: true });
  }
};

module.exports = isValidAuthToken;
