const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { models } = require('@/db');

const authUser = async (req, res, { user, databasePassword }) => {
  const isMatch = await bcrypt.compare(databasePassword.salt + req.body.password, databasePassword.password);

  if (!isMatch) {
    return res.status(403).json({ success: false, result: null, message: 'Invalid credentials.' });
  }

  const token = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: req.body.remember ? '8760h' : '24h' }
  );

  // Add session record (replaces $push loggedSessions)
  await databasePassword.createSession({ token });

  const platforms = await models.Platform.findAll({
    where: { removed: false, enabled: true },
    order: [['sort_order', 'ASC'], ['id', 'ASC']],
  });

  return res.status(200).json({
    success: true,
    result: {
      _id: user.id,
      name: user.name,
      surname: user.surname,
      role: user.role,
      email: user.email,
      photo: user.photo,
      token,
      maxAge: req.body.remember ? 365 : null,
      platforms,
    },
    message: 'Successfully login user',
  });
};

module.exports = authUser;
