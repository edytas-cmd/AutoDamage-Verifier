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
  isConsistent: "Consistent" | "Partially Consistent" | "Inconsistent" | "Insufficient Data";
  reasoning: string;
  unrelatedDamages: UnrelatedDamage[];
  missingInfo?: string[]; // New field for specifying what's missing
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
    Jesteś ekspertem ds. rekonstrukcji wypadków drogowych i rzeczoznawcą samochodowym. 
    Przeanalizuj dostarczone zdjęcia pojazdów oraz poniższy opis zdarzenia:
    "${description}"

    Twoim zadaniem jest przeprowadzenie rygorystycznej analizy technicznej. 

    WAŻNA ZASADA (BRAK DANYCH):
    Jeśli dostarczony materiał (zdjęcia lub opis) jest niewystarczający do wykonania rzetelnej analizy porównawczej o wysokim stopniu prawdopodobieństwa, NIE WOLNO Ci czynić bezpodstawnych założeń ani "wymyślać" przebiegu zdarzenia. 
    W takim przypadku ustaw "isConsistent" na "Insufficient Data" i w polu "missingInfo" wymień konkretnie, czego brakuje (np. zdjęcia konkretnej strony pojazdu sprawcy, zbliżenia na uszkodzenie, pomiary wysokości uszkodzeń, bardziej szczegółowy opis prędkości itp.).

    KRYTERIA ANALIZY (jeśli dane są wystarczające):
    1. IDENTYFIKACJA USZKODZEŃ: Kierunkowość, zakres, wektor siły.
    2. ANALIZA FIZYKI I MATERIAŁÓW: Zachowanie materiałów, parametry pojazdów (masa, gabaryty), logika prędkości.
    3. WYKRYWANIE USZKODZEŃ BEZ ZWIĄZKU: Korozja, brud, inne wektory siły.
    4. ANALIZA PORÓWNAWCZA: Kompatybilność wysokości i kształtów między pojazdami.

    Zwróć wynik w formacie JSON zgodnie ze schematem:
    {
      "damages": ["lista zidentyfikowanych uszkodzeń"],
      "isConsistent": "Consistent" | "Partially Consistent" | "Inconsistent" | "Insufficient Data",
      "reasoning": "Szczegółowa ekspertyza techniczna LUB wyjaśnienie dlaczego dane są niewystarczające.",
      "unrelatedDamages": [
        {
          "description": "opis uszkodzenia bez związku",
          "type": "pre_existing" | "unrelated_impact",
          "boundingBox": [ymin, xmin, ymax, xmax],
          "imageIndex": 0
        }
      ],
      "missingInfo": ["lista brakujących elementów, jeśli isConsistent to Insufficient Data"]
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
            enum: ["Consistent", "Partially Consistent", "Inconsistent", "Insufficient Data"],
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
          missingInfo: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
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
