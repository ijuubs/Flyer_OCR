import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY! });

export interface ExtractedProduct {
  name: string;
  price: number;
  unit: string;
  originalPrice?: number;
  isSpecial: boolean;
  category?: string;
  brand?: string;
}

export interface FlyerExtractionResult {
  storeName: string;
  location?: string;
  openingHours?: string;
  validityStart?: string;
  validityEnd?: string;
  products: ExtractedProduct[];
}

export async function extractFlyerData(base64Image: string, mimeType: string): Promise<FlyerExtractionResult> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: `Extract all product details from this Fiji supermarket flyer. 
            Identify the store name, location, opening hours, and deal validity dates if present.
            For each product, extract: name, price, unit (e.g., kg, pack, 500g), original price (if on sale), and if it's a special deal.
            Also categorize the products (e.g., Dairy, Meat, Pantry, etc.) and identify the brand if possible.
            Return the data in a structured JSON format.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          storeName: { type: Type.STRING },
          location: { type: Type.STRING },
          openingHours: { type: Type.STRING },
          validityStart: { type: Type.STRING, description: "ISO date format" },
          validityEnd: { type: Type.STRING, description: "ISO date format" },
          products: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
                unit: { type: Type.STRING },
                originalPrice: { type: Type.NUMBER },
                isSpecial: { type: Type.BOOLEAN },
                category: { type: Type.STRING },
                brand: { type: Type.STRING },
              },
              required: ["name", "price"],
            },
          },
        },
        required: ["storeName", "products"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as FlyerExtractionResult;
}
