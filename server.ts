import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '25mb' }));

// Lazy AI client: re-reads the key on every request, so a key set at runtime
// (Admin Access -> Gemini Key) works IMMEDIATELY - no server restart needed.
let ai: GoogleGenAI | null = null;
let aiKeyInUse = '';

function getAI(): GoogleGenAI {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    throw new Error(
      'No Gemini API key set. Paste your key once in the app: Admin Access -> Gemini AI Key - it works instantly, no restart.'
    );
  }
  if (!ai || aiKeyInUse !== key) {
    ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    aiKeyInUse = key;
  }
  return ai;
}

app.post('/api/scan-bill', async (req, res) => {
  try {
    const ai = getAI();
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided for bill scanning' });
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

    const isPdf = mimeType === 'application/pdf' || imageBase64.startsWith('data:application/pdf');
    const effectiveMimeType = isPdf ? 'application/pdf' : (mimeType || 'image/jpeg');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType: effectiveMimeType,
            data: cleanBase64,
          },
        },
        {
          text: `You are an expert commercial logistics, procurement and warehouse inventory auditor for Global Futura Inc. (edible oils, honey, and food packaging enterprise).
Examine this bill, supplier invoice, delivery challan, goods receipt note (GRN), purchase invoice, or warehouse receiving document (image or PDF).

Extract all line items and structured bill details into a clean JSON object with this exact schema:
{
  "vendorName": string,
  "billNumber": string,
  "billDate": string,
  "documentType": "purchase_invoice" | "delivery_challan" | "goods_receipt" | "packing_slip" | "other",
  "targetContainer": string | null,
  "summary": string,
  "items": [
    {
      "itemName": string,
      "materialType": "bottle" | "cap" | "carton" | "label" | "raw_material" | "preform" | "wad" | "spout" | "sleeve" | "pallet" | "ink" | "none",
      "matchedSku": string,
      "quantity": number,
      "unit": "pcs" | "kg" | "cartons" | "ltr" | "nos",
      "unitRate": number,
      "totalAmount": number
    }
  ],
  "totalBillAmount": number
}

Rules:
1. "materialType" must be one of: "bottle", "cap", "carton", "label", "raw_material", "preform", "wad", "spout", "sleeve", "pallet", "ink", or "none".
2. If the item is edible oil or honey (e.g. Mustard Oil, Soybean Oil, Sunflower Oil, Canola Oil, Acacia Honey, Sidr Honey), classify as "raw_material".
3. "matchedSku" should match standard packaging formats if recognizable (e.g. "1 L PET", "5 L PET", "500 ml Glass", "2 KG Bucket", "3.79 L HDPE").
4. "quantity" must be positive number. Extract actual count or weight received.
5. Return ONLY pure valid JSON with no markdown formatting.`,
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error scanning bill with Gemini:', error);
    return res.status(500).json({
      error: error.message || 'Failed to analyze bill image with Gemini AI',
    });
  }
});

app.post('/api/scan-customer', async (req, res) => {
  try {
    const ai = getAI();
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'No file provided for customer account extraction' });
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const isPdf = mimeType === 'application/pdf' || imageBase64.startsWith('data:application/pdf');
    const effectiveMimeType = isPdf ? 'application/pdf' : (mimeType || 'image/jpeg');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType: effectiveMimeType,
            data: cleanBase64,
          },
        },
        {
          text: `You are an expert data-entry assistant for Global Futura Inc. (edible oils, honey, and food packaging enterprise).
Examine this customer/party account document (contract sheet, order sheet, shipment plan, price list, or scanned party ledger page — image or PDF).

Extract every customer/party record into a clean JSON object with this exact schema:
{
  "accounts": [
    {
      "partyName": string,
      "partyCode": string,
      "cbm": string,
      "contractNo": string,
      "orderNo": string,
      "cartonQty": string,
      "otherQty": string,
      "address": string,
      "contactPerson": string,
      "email": string,
      "phone": string,
      "portOfLoading": string,
      "portOfDischarge": string,
      "finalDestination": string,
      "salesPack": string,
      "items": string,
      "pendingCharges": string
    }
  ]
}

Rules:
1. Copy the party's name, code, CBM, contract number, order number, carton qty, other qty, address, contact person, email, phone, ports, final destination, sales pack, items, and any pending charges exactly as they appear in the document.
2. If a field is not present in the document, return an empty string "" for it. Never invent data.
3. A single document may contain multiple parties/rows — return one object per party.
4. "items" should list the products/brands/SKUs associated with the party, comma separated.
5. Return ONLY pure valid JSON with no markdown formatting.`,
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error scanning customer document with Gemini:', error);
    return res.status(500).json({
      error: error.message || 'Failed to analyze customer document with Gemini AI',
    });
  }
});

app.post('/api/scan-pending-deliveries', async (req, res) => {
  try {
    const ai = getAI();
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'No file provided for pending deliveries extraction' });
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const isPdf = mimeType === 'application/pdf' || imageBase64.startsWith('data:application/pdf');
    const effectiveMimeType = isPdf ? 'application/pdf' : (mimeType || 'image/jpeg');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          inlineData: {
            mimeType: effectiveMimeType,
            data: cleanBase64,
          },
        },
        {
          text: `You are an expert logistics data-entry assistant for Global Futura Inc.
Examine this pending deliveries document (delivery plan sheet, dispatch schedule, or scanned delivery sheet — image or PDF).

Extract every delivery order into a clean JSON object with this exact schema:
{
  "orders": [
    {
      "doNo": string,
      "poDate": string,
      "customerName": string,
      "salesExecutive": string,
      "address": string,
      "region": string,
      "items": [
        {
          "item": string,
          "brand": string,
          "qty": string,
          "salePrice": string,
          "labelOrdered": string,
          "labelReceived": string,
          "remarks": string
        }
      ]
    }
  ]
}

Rules:
1. "doNo" is the Delivery Order / invoice number, "poDate" is the Purchase Order date exactly as written.
2. "region" is the section/location grouping if visible (e.g. "Bronx", "New Jersey", "Brooklyn"); otherwise "".
3. Copy every item row under each order: full item/product description, brand, quantity exactly as written (e.g. "60 X 3 PALLETS", "10 CASES"), sale price, label ordered (Yes/Not), label received (Received/Not/...), and remarks (e.g. "to be ready", "Ready", "Stock Not Available").
4. If a field is not present, return an empty string. Never invent data.
5. Return ONLY pure valid JSON with no markdown formatting.`,
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error scanning pending deliveries with Gemini:', error);
    return res.status(500).json({
      error: error.message || 'Failed to analyze pending deliveries document with Gemini AI',
    });
  }
});

// Runtime Gemini key management - paste the key in the app, works instantly
app.post('/api/set-gemini-key', (req, res) => {
  const key = String(req.body?.key || '').trim();
  if (!/^(AIza[0-9A-Za-z_-]{30,}|AQ\.[A-Za-z0-9_.-]{40,})$/.test(key)) {
    return res.status(400).json({ error: 'Invalid key format (accepted: AIza... or AQ.Ab... keys)' });
  }
  process.env.GEMINI_API_KEY = key;
  try {
    fs.writeFileSync(path.join(__dirname, '.env'), 'GEMINI_API_KEY=' + key + '\n');
  } catch {}
  res.json({ ok: true });
});

app.get('/api/gemini-key-status', (_req, res) => {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  res.json({ set: !!key, preview: key ? key.slice(0, 6) + '..' + key.slice(-4) : '' });
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Global Futura ERP server running at http://0.0.0.0:${port}`);
  });
}

startServer();
