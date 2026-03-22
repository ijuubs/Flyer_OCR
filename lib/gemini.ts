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
  boundingBox?: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
  };
  canonicalName?: string;
  imageDescription?: string;
}

export interface FlyerExtractionResult {
  storeName: string;
  location?: string;
  openingHours?: string;
  validityStart?: string;
  validityEnd?: string;
  products: ExtractedProduct[];
  needsReview?: boolean;
  validationErrors?: string[];
}

export async function extractFlyerData(base64Image: string, mimeType: string): Promise<FlyerExtractionResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
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
              text: `Extract all product details from this supermarket flyer. 
              Identify the store name, location, opening hours, and deal validity dates.
              For each product, extract: name, price, unit, original price, and if it's a special deal.
              Also categorize the products and identify the brand.
              IMPORTANT: Provide a bounding box [ymin, xmin, ymax, xmax] for each product's visual area in the image (values 0-1000).
              Provide a 'canonicalName' (standardized name) and a brief 'imageDescription' of the product's visual appearance.
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
                  canonicalName: { type: Type.STRING },
                  imageDescription: { type: Type.STRING },
                  boundingBox: {
                    type: Type.OBJECT,
                    properties: {
                      ymin: { type: Type.NUMBER },
                      xmin: { type: Type.NUMBER },
                      ymax: { type: Type.NUMBER },
                      xmax: { type: Type.NUMBER },
                    },
                    required: ["ymin", "xmin", "ymax", "xmax"],
                  },
                },
                required: ["name", "price", "boundingBox"],
              },
            },
          },
          required: ["storeName", "products"],
        },
      },
    });

    if (!response.text) {
      console.error("Gemini returned empty response");
      throw new Error("Gemini returned empty response");
    }

    return JSON.parse(response.text) as FlyerExtractionResult;
  } catch (err) {
    console.error("Gemini extraction error:", err);
    throw err;
  }
}
