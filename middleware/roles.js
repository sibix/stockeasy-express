function requireRole(...roles) {
  return (req, res, next) => {
    if (req.session && roles.includes(req.session.role)) {
      next();
    } else {
      res.status(403).json({ error: "Access denied" });
    }
  };
}

module.exports = { requireRole };
