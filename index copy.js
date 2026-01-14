import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import open from 'open';
import { google } from 'googleapis';
import { URLS } from './urls.js';

// ================= CONFIG =================
const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive',
];
const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'credentials.json';

// ================= AUTH =================
async function authorize() {
  const credentials = JSON.parse(
    fs.readFileSync(CREDENTIALS_PATH, 'utf8')
  );

  // SUPPORT BOTH "installed" AND "web"
  const oauthConfig = credentials.installed || credentials.web;

  if (!oauthConfig) {
    throw new Error(
      'Invalid credentials.json: expected "installed" or "web" key'
    );
  }

  const { client_secret, client_id, redirect_uris } = oauthConfig;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    oAuth2Client.setCredentials(
      JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
    );
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting this url:\n', authUrl);
  await open(authUrl);

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const code = await new Promise(resolve =>
    rl.question('Enter the code from that page here: ', resolve)
  );

  rl.close();

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

  return oAuth2Client;
}


// ================= SCRAPER =================
function extractStructuredContent(html) {
  const $ = cheerio.load(html);
  const elements = [];

  $('body')
    .find('h1, h2, h3, h4, p, ul')
    .each((_, el) => {
      const tag = el.tagName.toLowerCase();

      if (['h1', 'h2', 'h3', 'h4', 'p'].includes(tag)) {
        const text = $(el).text().trim();
        if (text.length > 0) {
          elements.push({ type: tag, text });
        }
      }

      if (tag === 'ul') {
        $(el)
          .find('li')
          .each((_, li) => {
            const text = $(li).text().trim();
            if (text.length > 0) {
              elements.push({ type: 'li', text });
            }
          });
      }
    });

  return elements;
}

// ================= GOOGLE DOCS =================
async function createGoogleDoc(docs, title) {
  const doc = await docs.documents.create({
    requestBody: { title },
  });
  return doc.data.documentId;
}

function buildRequests(content) {
  const requests = [];

  for (const item of content) {
    // Insert text at top (Google shifts content automatically)
    requests.push({
      insertText: {
        location: { index: 1 },
        text: item.text + '\n',
      },
    });

    // Headings
    if (item.type.startsWith('h')) {
      requests.push({
        updateParagraphStyle: {
          range: {
            startIndex: 1,
            endIndex: item.text.length + 1,
          },
          paragraphStyle: {
            namedStyleType: `HEADING_${item.type[1]}`,
          },
          fields: 'namedStyleType',
        },
      });
    }

    // Bullets
    if (item.type === 'li') {
      requests.push({
        createParagraphBullets: {
          range: {
            startIndex: 1,
            endIndex: item.text.length + 1,
          },
          bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
        },
      });
    }
  }

  return requests;
}


// ================= MAIN =================
async function main() {
  const auth = await authorize();
  const docs = google.docs({ version: 'v1', auth });

  for (const url of URLS) {
    console.log(`Processing: ${url}`);

    const html = (await axios.get(url)).data;
    const content = extractStructuredContent(html);

    const title = url.replace(/https?:\/\//, '').split('/')[0];
    const docId = await createGoogleDoc(docs, title);

    const requests = buildRequests(content);

    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests },
    });

    console.log(`✅ Google Doc created: https://docs.google.com/document/d/${docId}`);
  }
}

main().catch(console.error);
