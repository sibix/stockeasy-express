require('dotenv').config();

const express      = require('express');
const session      = require('express-session');
const path         = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Session ────────────────────────────────────────────────
app.use(session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   false,
    httpOnly: true,
    maxAge:   1000 * 60 * 60 * 24
  }
}));

// ── Public routes ──────────────────────────────────────────
const authRouter = require('./routes/auth');
app.use('/auth', authRouter);
app.use('/auth.html', express.static(path.join(__dirname, 'public/auth.html')));

// ── Serve static files publicly ────────────────────────────
app.use(express.static('public'));

// ── Session gate ───────────────────────────────────────────
app.use((req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    const ext = path.extname(req.path);
    if (ext && ext !== '.html') return next();
    res.redirect('/auth.html');
  }
});

// ── Protected routes ───────────────────────────────────────
app.use('/categories', require('./routes/categories'));
app.use('/items',      require('./routes/items'));
app.use('/suppliers',  require('./routes/suppliers'));
app.use('/purchases',  require('./routes/purchases'));
app.use('/sales',      require('./routes/sales'));

// ── 404 handler ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ───────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong.' });
});

// ── Start ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`StockEasy running at http://localhost:${PORT}`);
});
