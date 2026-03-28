/**
 * Gemini AI utility for ANPR Analytics
 *
 * Converts natural-language questions into structured MongoDB query parameters,
 * then formats raw results back into a human-readable answer.
 *
 * Feature-gated: aiAnalytics (ENTERPRISE only)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  generationConfig: {
    temperature: 0.2, // low temp for deterministic structured output
    maxOutputTokens: 1024,
  },
});

/* ─────────────────────────────────────────────────────────────
   INTENT SCHEMA returned by Gemini
   ─────────────────────────────────────────────────────────────
   {
     queryType: "trip_count" | "trip_list" | "active_trips" |
                "vehicle_lookup" | "barrier_events" | "site_summary" |
                "overstay" | "vendor_trips" | "load_status" | "unknown",
     filters: {
       dateFrom?:      ISO string,
       dateTo?:        ISO string,
       status?:        "INSIDE" | "EXITED" | "COMPLETED" | "CANCELLED" | "OVERSTAY",
       vehicleNumber?: string,
       vendorName?:    string,
       siteName?:      string,
       loadStatus?:    "FULL" | "PARTIAL" | "EMPTY" | "LOADED" | "UNLOADED",
       vehicleType?:   string,
     },
     groupBy?:  "site" | "vendor" | "vehicleType" | "loadStatus" | "date",
     limit?:    number,
     humanIntent: string   // one-line summary of what the user wants
   }
*/

const TODAY = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/**
 * Step 1 — Parse natural language into a structured intent object.
 * @param {string} question
 * @param {string[]} siteNames  — list of site names the client owns (for context)
 * @returns {Promise<Object>} intent
 */
export async function parseAnalyticsIntent(question, siteNames = []) {
  const todayStr = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const prompt = `You are an analytics query parser for an ANPR (Automatic Number Plate Recognition) vehicle management system.
Today's date is ${todayStr}.

The system tracks:
- Trips: vehicles entering/exiting sites (fields: plateText, status, entryAt, exitAt, loadStatus, driverName)
- Vehicles: registered vehicles with type (TRUCK_12_WHEEL, PICKUP, TANKER, CAR, BIKE, etc.)
- Sites: physical locations${siteNames.length ? ` (client has: ${siteNames.join(", ")})` : ""}
- Vendors: companies whose vehicles visit
- Barrier events: gate open/close actions

Parse the user's question and return ONLY a valid JSON object with this exact structure:
{
  "queryType": one of ["trip_count","trip_list","active_trips","vehicle_lookup","barrier_events","site_summary","overstay","vendor_trips","load_status","unknown"],
  "filters": {
    "dateFrom": "ISO date string or null",
    "dateTo": "ISO date string or null",
    "status": "INSIDE|EXITED|COMPLETED|CANCELLED|OVERSTAY or null",
    "vehicleNumber": "partial plate string or null",
    "vendorName": "vendor name or null",
    "siteName": "site name or null",
    "loadStatus": "FULL|PARTIAL|EMPTY|LOADED|UNLOADED or null",
    "vehicleType": "vehicle type enum or null"
  },
  "groupBy": "site|vendor|vehicleType|loadStatus|date or null",
  "limit": number or null,
  "humanIntent": "one sentence describing what the user wants"
}

Rules:
- For "today", set dateFrom to start of today (${TODAY().split("T")[0]}T00:00:00.000Z) and dateTo to end of today
- For "this week", set dateFrom to 7 days ago
- For "this month", set dateFrom to 30 days ago
- For "yesterday", set dateFrom/dateTo to yesterday's date range
- Return null for any filter not mentioned
- queryType "trip_count" = user wants a number/count
- queryType "trip_list" = user wants to see individual trips
- queryType "active_trips" = user wants currently inside vehicles
- queryType "overstay" = user asks about vehicles staying too long
- queryType "site_summary" = user wants per-site breakdown
- queryType "vendor_trips" = user asks about a specific vendor
- queryType "load_status" = user asks about load/material counts
- queryType "barrier_events" = user asks about gate open/close history

User question: ${question}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // strip markdown fences if present
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Gemini returned no valid JSON");

  return JSON.parse(match[0]);
}

/**
 * Step 2 — Format raw MongoDB results into a natural-language answer.
 * @param {string} question   original user question
 * @param {Object} intent     parsed intent
 * @param {any}    data       raw query result
 * @returns {Promise<string>} human-readable answer
 */
export async function formatAnalyticsAnswer(question, intent, data) {
  const dataStr = JSON.stringify(data, null, 2);

  const prompt = `You are an ANPR analytics assistant. The user asked a question and you have the raw data to answer it.

User question: "${question}"
Query intent: ${intent.humanIntent}
Raw data: ${dataStr.length > 3000 ? dataStr.substring(0, 3000) + "\n...(truncated)" : dataStr}

Provide a clear, concise answer in plain text (no markdown, no bullet symbols, no bold).
- Lead with the direct answer (number, list, or summary)
- Add 1-2 sentences of context if useful
- Keep it under 150 words
- Use Indian date/time format where relevant
- If data is empty, say so clearly and suggest what might be wrong`;

  const result = await model.generateContent(prompt);
  let answer = result.response.text().trim();

  // strip any markdown that slips through
  answer = answer.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,6}\s/g, "");
  return answer;
}

export function isGeminiConfigured() {
  return !!process.env.GEMINI_API_KEY;
}
