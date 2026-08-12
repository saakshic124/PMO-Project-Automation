const express = require('express');
const router = express.Router();

// ---- Mark43 API integration — not implemented yet. ----
// Drop real endpoints here once you have Mark43 API credentials/docs. Likely useful
// directions, once you know what Mark43's API actually exposes:
//   - Look up an existing tenant/deal by name to cross-reference against a parsed SOW
//     (catch a mismatch between what was sold and what's provisioned)
//   - Push the generated project summary/timeline into a Mark43-side project record
//   - Pull Mark43 order form / product catalog data server-side instead of relying on
//     whatever file the user happened to upload
//
// Keep the same shape as the /api/draft and /api/publish routes in server.js: the
// Mark43 API key/token should live in an env var here, never touch the client.
//
// const MARK43_API_KEY = process.env.MARK43_API_KEY;
// const MARK43_BASE_URL = process.env.MARK43_BASE_URL;

router.get('/', (req, res) => {
  res.json({
    status: 'not implemented',
    note: 'Add Mark43 API routes here once credentials/API docs are available.',
  });
});

module.exports = router;
