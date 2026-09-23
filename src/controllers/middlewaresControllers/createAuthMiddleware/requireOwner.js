const requireOwner = (req, res, next) => {
  if (req.admin && req.admin.role === 'owner') {
    return next();
  }
  return res.status(403).json({
    success: false,
    result: null,
    message: 'Only owners can access this resource.',
  });
};

module.exports = requireOwner;
