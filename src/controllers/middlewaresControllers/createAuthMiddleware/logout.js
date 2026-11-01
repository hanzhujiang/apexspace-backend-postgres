const crypto = require('crypto');
const { models } = require('@/db');

const logout = async (req, res, { userModel }) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  const adminPassword = await models.AdminPassword.findOne({ where: { admin_id: req.admin.id, removed: false } });
  if (adminPassword) {
    if (token) {
      // Remove specific JWT whitelist entry (replaces $pull loggedSessions)
      await models.AdminSession.destroy({ where: { admin_password_id: adminPassword.id, token } });
      // Close the matching activity-session row (audit trail)
      try {
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        await models.UserSession.update(
          { endedAt: new Date() },
          { where: { tokenHash, endedAt: null } }
        );
      } catch (err) {
        console.error('UserSession close (logout) failed:', err.message);
      }
    } else {
      // Clear ALL sessions for this user — JWT whitelist + activity audit
      await models.AdminSession.destroy({ where: { admin_password_id: adminPassword.id } });
      try {
        await models.UserSession.update(
          { endedAt: new Date() },
          { where: { admin_id: req.admin.id, endedAt: null } }
        );
      } catch (err) {
        console.error('UserSession close-all (logout) failed:', err.message);
      }
    }
  }

  return res.json({ success: true, result: {}, message: 'Successfully logged out' });
};

module.exports = logout;
