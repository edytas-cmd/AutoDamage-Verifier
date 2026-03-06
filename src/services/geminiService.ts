import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface DamageAnalysis {
  damages: string[];
  isConsistent: "Consistent" | "Partially Consistent" | "Inconsistent";
  reasoning: string;
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
    // Adding a label to help the model distinguish
    text: `Zdjęcie pojazdu POSZKODOWANEGO #${index + 1}`
  }));

  const perpetratorImageParts = perpetratorImages.map((img, index) => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: img.split(",")[1] || img,
    },
    text: `Zdjęcie pojazdu SPRAWCY #${index + 1}`
  }));

  const prompt = `
    Przeanalizuj dostarczone zdjęcia pojazdów oraz poniższy opis zdarzenia drogowego:
    "${description}"

    Zadania:
    1. Zidentyfikuj uszkodzenia na pojeździe POSZKODOWANEGO.
    2. Zidentyfikuj uszkodzenia na pojeździe SPRAWCY (jeśli zdjęcia zostały dostarczone).
    3. Dokonaj ANALIZY PORÓWNAWCZEJ:
       - Czy uszkodzenia na obu pojazdach (poszkodowanego i sprawcy) korelują ze sobą pod względem wysokości, kształtu i charakteru (np. czy wgniecenie na jednym odpowiada wystającemu elementowi na drugim)?
       - Czy uszkodzenia obu pojazdów są fizycznie zbieżne z zadeklarowanymi okolicznościami opisanymi przez użytkownika?
    4. Oceń ogólną wiarygodność zdarzenia.
    5. Całość analizy musi być w języku polskim.

    Zwróć wynik w formacie JSON zgodnie ze schematem:
    {
      "damages": ["lista zidentyfikowanych uszkodzeń na obu pojazdach"],
      "isConsistent": "Consistent" | "Partially Consistent" | "Inconsistent",
      "reasoning": "szczegółowa analiza porównawcza w języku polskim, wyjaśniająca korelację (lub jej brak) między uszkodzeniami obu pojazdów w kontekście opisu zdarzenia"
    }
  `;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        ...victimImageParts.flatMap(p => [p.inlineData ? { inlineData: p.inlineData } : null, { text: p.text }].filter(Boolean) as any),
        ...perpetratorImageParts.flatMap(p => [p.inlineData ? { inlineData: p.inlineData } : null, { text: p.text }].filter(Boolean) as any),
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
            description: "List of identified damages",
          },
          isConsistent: {
            type: Type.STRING,
            enum: ["Consistent", "Partially Consistent", "Inconsistent"],
            description: "Verdict on consistency",
          },
          reasoning: {
            type: Type.STRING,
            description: "Detailed explanation of the analysis",
          },
        },
        required: ["damages", "isConsistent", "reasoning"],
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
