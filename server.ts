import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import Database from 'better-sqlite3';
import cron from 'node-cron';
import { GoogleGenAI } from "@google/genai";
import { BRAZIL_CITIES } from './src/types';
import { AGENT_PROMPT_TEMPLATE } from './src/constants';

const db = new Database('leadforce.db');

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT,
    professionalType TEXT,
    status TEXT,
    leadsTarget INTEGER,
    leadsFound INTEGER,
    createdAt TEXT,
    lastRunAt TEXT,
    searchRadius INTEGER,
    currentCityIndex INTEGER
  );

  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    campaignId TEXT,
    name TEXT,
    placeId TEXT,
    mapsUrl TEXT,
    phone TEXT,
    website TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL,
    rating REAL,
    userRatingsTotal INTEGER,
    reviewSummary TEXT,
    sentiment TEXT,
    highlights TEXT,
    accessibility TEXT,
    openingHours TEXT,
    isOpenNow INTEGER,
    photos TEXT,
    neighborhoodContext TEXT,
    extractedAt TEXT,
    FOREIGN KEY(campaignId) REFERENCES campaigns(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    startTime TEXT,
    frequency TEXT,
    batchSize INTEGER,
    dailyGoal INTEGER,
    geminiApiKey TEXT
  );

  INSERT OR IGNORE INTO settings (id, startTime, frequency, batchSize, dailyGoal, geminiApiKey)
  VALUES ('default', '03:00', '1h', 5, 1000, '');
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.get('/api/settings', (req, res) => {
    const settings = db.prepare('SELECT * FROM settings WHERE id = "default"').get();
    res.json(settings);
  });

  app.post('/api/settings', (req, res) => {
    const { startTime, frequency, batchSize, dailyGoal, geminiApiKey } = req.body;
    db.prepare(`
      UPDATE settings 
      SET startTime = ?, frequency = ?, batchSize = ?, dailyGoal = ?, geminiApiKey = ?
      WHERE id = "default"
    `).run(startTime, frequency, batchSize, dailyGoal, geminiApiKey);
    
    // Reschedule cron job
    setupCronJob();
    res.json({ success: true });
  });

  app.get('/api/campaigns', (req, res) => {
    const campaigns = db.prepare('SELECT * FROM campaigns').all();
    res.json(campaigns);
  });

  app.post('/api/campaigns', (req, res) => {
    const { id, name, professionalType, status, leadsTarget, leadsFound, createdAt, searchRadius, currentCityIndex } = req.body;
    db.prepare(`
      INSERT INTO campaigns (id, name, professionalType, status, leadsTarget, leadsFound, createdAt, searchRadius, currentCityIndex)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, professionalType, status, leadsTarget, leadsFound, createdAt, searchRadius, currentCityIndex);
    res.json({ success: true });
  });

  app.patch('/api/campaigns/:id', (req, res) => {
    const { id } = req.params;
    const { status, leadsFound, currentCityIndex, lastRunAt } = req.body;
    
    if (status) db.prepare('UPDATE campaigns SET status = ? WHERE id = ?').run(status, id);
    if (leadsFound !== undefined) db.prepare('UPDATE campaigns SET leadsFound = ? WHERE id = ?').run(leadsFound, id);
    if (currentCityIndex !== undefined) db.prepare('UPDATE campaigns SET currentCityIndex = ? WHERE id = ?').run(currentCityIndex, id);
    if (lastRunAt) db.prepare('UPDATE campaigns SET lastRunAt = ? WHERE id = ?').run(lastRunAt, id);
    
    res.json({ success: true });
  });

  app.get('/api/leads', (req, res) => {
    const leads = db.prepare('SELECT * FROM leads').all();
    // Parse JSON strings back to arrays/objects
    const formattedLeads = leads.map((l: any) => ({
      ...l,
      highlights: l.highlights ? JSON.parse(l.highlights) : [],
      accessibility: l.accessibility ? JSON.parse(l.accessibility) : [],
      openingHours: l.openingHours ? JSON.parse(l.openingHours) : [],
      photos: l.photos ? JSON.parse(l.photos) : [],
      isOpenNow: !!l.isOpenNow
    }));
    res.json(formattedLeads);
  });

  app.post('/api/leads', (req, res) => {
    const leads = Array.isArray(req.body) ? req.body : [req.body];
    const insert = db.prepare(`
      INSERT OR IGNORE INTO leads (
        id, campaignId, name, placeId, mapsUrl, phone, website, address, 
        latitude, longitude, rating, userRatingsTotal, reviewSummary, 
        sentiment, highlights, accessibility, openingHours, isOpenNow, 
        photos, neighborhoodContext, extractedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((leadsToInsert) => {
      for (const lead of leadsToInsert) {
        insert.run(
          lead.id, lead.campaignId, lead.name, lead.placeId, lead.mapsUrl, 
          lead.phone, lead.website, lead.address, lead.latitude, lead.longitude, 
          lead.rating, lead.userRatingsTotal, lead.reviewSummary, lead.sentiment, 
          JSON.stringify(lead.highlights || []), 
          JSON.stringify(lead.accessibility || []), 
          JSON.stringify(lead.openingHours || []), 
          lead.isOpenNow ? 1 : 0, 
          JSON.stringify(lead.photos || []), 
          lead.neighborhoodContext, lead.extractedAt
        );
      }
    });

    transaction(leads);
    res.json({ success: true });
  });

  // Agent Logic (Backend Version)
  const runExtraction = async (campaignId?: string) => {
    console.log('🤖 Agente iniciado...');
    const activeCampaigns = campaignId 
      ? db.prepare('SELECT * FROM campaigns WHERE id = ?').all(campaignId)
      : db.prepare('SELECT * FROM campaigns WHERE status = "active"').all();

    if (activeCampaigns.length === 0) return;

    const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ Erro: Nenhuma GEMINI_API_KEY configurada.');
      return;
    }

    const ai = new GoogleGenAI({ apiKey });

    for (const campaign of activeCampaigns as any[]) {
      try {
        const city = BRAZIL_CITIES[campaign.currentCityIndex % BRAZIL_CITIES.length];
        const batchSize = 5;
        const prompt = AGENT_PROMPT_TEMPLATE(campaign.professionalType, city, batchSize);

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: {
            tools: [{ googleMaps: {} }],
            responseMimeType: "application/json",
          },
        });

        const text = response.text;
        const newLeadsData = JSON.parse(text || "[]");
        const leadsArray = Array.isArray(newLeadsData) ? newLeadsData : [newLeadsData];

        const formattedLeads = leadsArray.map((l: any) => ({
          ...l,
          id: l.id || Math.random().toString(36).substring(7),
          campaignId: campaign.id,
          extractedAt: new Date().toISOString()
        }));

        // Insert leads
        const insertLead = db.prepare(`
          INSERT OR IGNORE INTO leads (
            id, campaignId, name, placeId, mapsUrl, phone, website, address, 
            latitude, longitude, rating, userRatingsTotal, reviewSummary, 
            sentiment, highlights, accessibility, openingHours, isOpenNow, 
            photos, neighborhoodContext, extractedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const lead of formattedLeads) {
          insertLead.run(
            lead.id, lead.campaignId, lead.name, lead.placeId, lead.mapsUrl, 
            lead.phone, lead.website, lead.address, lead.latitude, lead.longitude, 
            lead.rating, lead.userRatingsTotal, lead.reviewSummary, lead.sentiment, 
            JSON.stringify(lead.highlights || []), 
            JSON.stringify(lead.accessibility || []), 
            JSON.stringify(lead.openingHours || []), 
            lead.isOpenNow ? 1 : 0, 
            JSON.stringify(lead.photos || []), 
            lead.neighborhoodContext, lead.extractedAt
          );
        }

        // Update campaign
        db.prepare('UPDATE campaigns SET leadsFound = leadsFound + ?, currentCityIndex = ?, lastRunAt = ? WHERE id = ?')
          .run(formattedLeads.length, (campaign.currentCityIndex + 1) % BRAZIL_CITIES.length, new Date().toISOString(), campaign.id);

        console.log(`✅ Sucesso: ${formattedLeads.length} novos leads para ${campaign.name}`);
      } catch (error) {
        console.error(`❌ Erro em ${campaign.name}:`, error);
      }
    }
  };

  app.post('/api/agent/run', async (req, res) => {
    const { campaignId } = req.body;
    runExtraction(campaignId); // Run in background
    res.json({ success: true, message: 'Agente iniciado em segundo plano.' });
  });

  // CRON JOB: Runs every hour
  cron.schedule('0 * * * *', () => {
    console.log('⏰ Executando extração agendada...');
    runExtraction();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
