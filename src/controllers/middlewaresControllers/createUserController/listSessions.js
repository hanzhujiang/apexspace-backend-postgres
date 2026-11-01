const { models, Op } = require('@/db');

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

const listSessions = async (userModel, req, res) => {
  const User = models[userModel];
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - THREE_DAYS_MS);

  const sessions = await models.UserSession.findAll({
    where: { lastActiveAt: { [Op.gte]: threeDaysAgo } },
    raw: true,
  });

  const byAdmin = new Map();
  for (const s of sessions) {
    const start = Math.max(new Date(s.startedAt).getTime(), threeDaysAgo.getTime());
    const end = Math.min(new Date(s.endedAt || s.lastActiveAt).getTime(), now.getTime());
    const duration = Math.max(0, end - start);

    const key = String(s.admin_id);
    const row = byAdmin.get(key) || { onlineMs: 0, lastOnlineAt: 0 };
    row.onlineMs += duration;
    const lastActive = new Date(s.lastActiveAt).getTime();
    if (lastActive > row.lastOnlineAt) row.lastOnlineAt = lastActive;
    byAdmin.set(key, row);
  }

  const admins = await User.findAll({
    where: { removed: false },
    attributes: ['id', 'name', 'surname', 'email', 'role', 'enabled'],
    raw: true,
  });

  const result = admins.map((a) => {
    const row = byAdmin.get(String(a.id));
    const fullName = `${a.name || ''} ${a.surname || ''}`.trim();
    return {
      _id: a.id,
      id: a.id,
      name: fullName || a.email,
      email: a.email,
      role: a.role,
      enabled: a.enabled,
      lastOnlineAt: row ? new Date(row.lastOnlineAt).toISOString() : null,
      onlineSecondsLast3Days: row ? Math.round(row.onlineMs / 1000) : 0,
    };
  });

  result.sort((x, y) => {
    if (x.lastOnlineAt && !y.lastOnlineAt) return -1;
    if (!x.lastOnlineAt && y.lastOnlineAt) return 1;
    if (!x.lastOnlineAt && !y.lastOnlineAt) return 0;
    return y.lastOnlineAt.localeCompare(x.lastOnlineAt);
  });

  return res.status(200).json({
    success: true,
    result,
    message: 'User sessions fetched successfully.',
  });
};

module.exports = listSessions;
