import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

// TEMP storage (for demo)
let latestGoogleDocUrl = null;

/**
 * GET /zapier
 * Show form + auto display result
 */
router.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Scrape URLs to Google Docs</title>
        <meta charset="utf-8" />
      </head>
      <body style="font-family: Arial; padding: 40px;">
        <h2>Scrape URLs to Google Docs</h2>

        <form method="POST" action="/zapier">
          <p>Enter one URL</p>
          <input
            type="url"
            name="url"
            required
            placeholder="https://example.com"
            style="width: 400px; padding: 8px;"
          />
          <br /><br />
          <button type="submit">Generate Google Docs</button>
        </form>

        <p id="result" style="margin-top:20px;"></p>

        <script>
          setInterval(async () => {
            const res = await fetch('/zapier/result');
            const data = await res.json();

            if (data.url) {
              document.getElementById('result').innerHTML =
                '<a href="' + data.url + '" target="_blank">📄 Open Google Doc</a>';
            }
          }, 3000);
        </script>
      </body>
    </html>
  `);
});

/**
 * POST /zapier
 * Send URL to Zapier
 */
router.post('/', async (req, res) => {
  const url = req.body?.url;

  if (!url) {
    return res.status(400).send('URL is required');
  }

  try {
    const zapierWebhook =
      `https://hooks.zapier.com/hooks/catch/26055726/uga3dov/?url=${encodeURIComponent(url)}`;

    await fetch(zapierWebhook);

    res.redirect('/zapier');
  } catch (error) {
    res.status(500).send('Failed to send to Zapier');
  }
});

/**
 * POST /zapier/callback
 * Zapier sends Google Doc link here
 */
router.post('/callback', (req, res) => {
  const { google_doc_url } = req.body;

  if (!google_doc_url) {
    return res.status(400).json({ error: 'google_doc_url missing' });
  }

  latestGoogleDocUrl = google_doc_url;

  res.json({ success: true });
});

/**
 * GET /zapier/result
 * Frontend fetches latest Google Doc link
 */
router.get('/result', (req, res) => {
  res.json({
    url: latestGoogleDocUrl
  });
});

export default router;
