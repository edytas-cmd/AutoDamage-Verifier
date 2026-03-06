import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface UnrelatedDamage {
  description: string;
  type: "pre_existing" | "unrelated_impact";
  boundingBox?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  imageIndex: number; // Index in the victimImages array
}

export interface DamageAnalysis {
  damages: string[];
  isConsistent: "Consistent" | "Partially Consistent" | "Inconsistent";
  reasoning: string;
  unrelatedDamages: UnrelatedDamage[];
}

export async function analyzeVehicleDamage(
  victimImages: string[], // base64 strings
  perpetratorImages: string[], // base64 strings
  description: string
): Promise<DamageAnalysis> {
  const model = "gemini-3.1-pro-preview";

  const victimImageParts = victimImages.map((img, index) => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: img.split(",")[1] || img,
    },
    text: `Zdjęcie pojazdu POSZKODOWANEGO #${index}`
  }));

  const perpetratorImageParts = perpetratorImages.map((img, index) => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: img.split(",")[1] || img,
    },
    text: `Zdjęcie pojazdu SPRAWCY #${index}`
  }));

  const prompt = `
    Przeanalizuj dostarczone zdjęcia pojazdów oraz poniższy opis zdarzenia drogowego:
    "${description}"

    Zadania:
    1. Zidentyfikuj uszkodzenia na pojeździe POSZKODOWANEGO.
    2. Zidentyfikuj uszkodzenia na pojeździe SPRAWCY (jeśli zdjęcia zostały dostarczone).
    3. Wykryj USZKODZENIA BEZ ZWIĄZKU (unrelated damages) na pojeździe POSZKODOWANEGO. Szukaj:
       - Śladów korozji wewnątrz zarysowań (sugeruje stary uraz).
       - Uszkodzeń w miejscach, które nie mogły mieć kontaktu przy opisanym zdarzeniu.
       - Warstw kurzu/brudu na "świeżych" uszkodzeniach.
       - Uszkodzeń o innym charakterze (np. pionowe rysy przy zderzeniu bocznym).
    4. Dokonaj ANALIZY PORÓWNAWCZEJ między pojazdami.
    5. Całość analizy musi być w języku polskim.

    Dla każdego wykrytego uszkodzenia bez związku podaj jego opis oraz współrzędne bounding box [ymin, xmin, ymax, xmax] w skali 0-1000, odnoszące się do konkretnego zdjęcia poszkodowanego (imageIndex).

    Zwróć wynik w formacie JSON zgodnie ze schematem:
    {
      "damages": ["lista wszystkich uszkodzeń"],
      "isConsistent": "Consistent" | "Partially Consistent" | "Inconsistent",
      "reasoning": "szczegółowa analiza porównawcza i uzasadnienie",
      "unrelatedDamages": [
        {
          "description": "opis uszkodzenia bez związku",
          "type": "pre_existing" | "unrelated_impact",
          "boundingBox": [ymin, xmin, ymax, xmax],
          "imageIndex": 0
        }
      ]
    }
  `;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        ...victimImageParts.flatMap(p => [{ inlineData: p.inlineData }, { text: p.text }]),
        ...perpetratorImageParts.flatMap(p => [{ inlineData: p.inlineData }, { text: p.text }]),
        { text: prompt }
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          damages: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          isConsistent: {
            type: Type.STRING,
            enum: ["Consistent", "Partially Consistent", "Inconsistent"],
          },
          reasoning: {
            type: Type.STRING,
          },
          unrelatedDamages: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                type: { type: Type.STRING, enum: ["pre_existing", "unrelated_impact"] },
                boundingBox: {
                  type: Type.ARRAY,
                  items: { type: Type.NUMBER },
                },
                imageIndex: { type: Type.INTEGER },
              },
              required: ["description", "type", "imageIndex"],
            },
          },
        },
        required: ["damages", "isConsistent", "reasoning", "unrelatedDamages"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  return JSON.parse(text) as DamageAnalysis;
}

export async function extractTextFromImage(base64Data: string, mimeType: string): Promise<string> {
  const model = "gemini-3.1-flash-lite-preview";

  const dataPart = {
    inlineData: {
      mimeType: mimeType,
      data: base64Data.split(",")[1] || base64Data,
    },
  };

  const prompt = "Odczytaj i wypisz cały tekst widoczny w tym pliku. Zwróć tylko odczytany tekst, bez żadnych dodatkowych komentarzy.";

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [dataPart, { text: prompt }],
    },
  });

  return response.text || "";
}
