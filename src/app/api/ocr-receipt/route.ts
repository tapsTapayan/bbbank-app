import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type OcrPaymentChannel =
  | "GCASH"
  | "MAYA"
  | "BANK_TRANSFER"
  | "OTHER_DIGITAL"
  | "CASH"
  | "UNKNOWN";

export type OcrReceiptResult = {
  isValidReceipt: boolean;
  paymentChannel: OcrPaymentChannel;
  amount: number | null;
  referenceNumber: string | null;
  transactionDate: string | null;
  confidenceNote: string | null;
  /** True when the model call failed and a safe empty payload was returned. */
  scanFailed?: boolean;
};

const CHANNELS: OcrPaymentChannel[] = [
  "GCASH",
  "MAYA",
  "BANK_TRANSFER",
  "OTHER_DIGITAL",
  "CASH",
  "UNKNOWN",
];

const FALLBACK: OcrReceiptResult = {
  isValidReceipt: true,
  paymentChannel: "UNKNOWN",
  amount: null,
  referenceNumber: null,
  transactionDate: null,
  confidenceNote:
    "AI scan unavailable. Enter amount, channel, and reference number manually — any authentic receipt or cash proof is accepted.",
  scanFailed: true,
};

const receiptSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    isValidReceipt: {
      type: Type.BOOLEAN,
      description:
        "True if the image is authentic proof of payment: GCash, Maya/PayMaya, bank/InstaPay/PESONet, other e-wallets, or cash acknowledgement. False only for unrelated/fake images.",
    },
    paymentChannel: {
      type: Type.STRING,
      format: "enum",
      enum: CHANNELS,
      description: "Detected payment channel.",
    },
    amount: {
      type: Type.NUMBER,
      nullable: true,
      description:
        "Exact amount paid in Philippine Peso. Ignore remaining wallet balance.",
    },
    referenceNumber: {
      type: Type.STRING,
      nullable: true,
      description:
        "Transaction reference (GCash Ref No., Maya Reference ID, InstaPay/PESONet ref, other digital ref, or cash slip number). Strip spaces and hyphens.",
    },
    transactionDate: {
      type: Type.STRING,
      nullable: true,
      description: "ISO 8601 date/time if visible on the receipt.",
    },
    confidenceNote: {
      type: Type.STRING,
      nullable: true,
      description:
        "Warning if the image is blurry, cropped, or missing key fields; otherwise null.",
    },
  },
  required: [
    "isValidReceipt",
    "paymentChannel",
    "amount",
    "referenceNumber",
    "transactionDate",
    "confidenceNote",
  ],
  propertyOrdering: [
    "isValidReceipt",
    "paymentChannel",
    "amount",
    "referenceNumber",
    "transactionDate",
    "confidenceNote",
  ],
};

const OCR_PROMPT = `You extract fields from Philippine payment proof for a sinking-fund app.

Accepted authentic proof (isValidReceipt = true):
- GCash / Maya (PayMaya) / other e-wallet success receipts
- Bank transfer, InstaPay, PESONet receipts
- Cash: handwritten acknowledgement, treasurer slip, or photo of cash handoff with amount noted
Reject ONLY clearly unrelated images (selfies, memes, blank screens) → isValidReceipt false.

Rules:
- amount = PHP amount paid only — never remaining wallet balance.
- referenceNumber: strip ALL spaces and hyphens. For cash without a slip number, return null.
- paymentChannel: GCASH | MAYA | BANK_TRANSFER | OTHER_DIGITAL | CASH | UNKNOWN.
  Use OTHER_DIGITAL for GrabPay, ShopeePay, and similar e-wallets not listed above.
- If blurry/cropped/uncertain, set confidenceNote; otherwise null.
Return JSON matching the schema.`;

function normalizeOcrPayload(raw: unknown): OcrReceiptResult {
  if (!raw || typeof raw !== "object") return { ...FALLBACK };

  const data = raw as Record<string, unknown>;
  const channel = data.paymentChannel;
  const paymentChannel = CHANNELS.includes(channel as OcrPaymentChannel)
    ? (channel as OcrPaymentChannel)
    : "UNKNOWN";

  let amount: number | null = null;
  if (typeof data.amount === "number" && Number.isFinite(data.amount)) {
    amount = Math.round(data.amount * 100) / 100;
  }

  let referenceNumber: string | null = null;
  if (typeof data.referenceNumber === "string" && data.referenceNumber.trim()) {
    referenceNumber = data.referenceNumber.replace(/[\s-]/g, "").toUpperCase();
  }

  return {
    isValidReceipt: Boolean(data.isValidReceipt),
    paymentChannel,
    amount,
    referenceNumber,
    transactionDate:
      typeof data.transactionDate === "string" ? data.transactionDate : null,
    confidenceNote:
      typeof data.confidenceNote === "string" && data.confidenceNote.trim()
        ? data.confidenceNote.trim()
        : null,
    scanFailed: false,
  };
}

/**
 * POST /api/ocr-receipt
 * Authenticated members upload a compressed receipt image; Gemini extracts
 * channel, amount, and reference for form auto-fill.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();

    if (claimsError || !claimsData?.claims?.sub) {
      return NextResponse.json(
        {
          ...FALLBACK,
          confidenceNote: "Sign in to scan receipts.",
        },
        { status: 401 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        {
          ...FALLBACK,
          confidenceNote: "No receipt image received. Enter details manually.",
        },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(FALLBACK);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "image/webp";
    const base64 = buffer.toString("base64");

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64,
          },
        },
        OCR_PROMPT,
      ],
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: receiptSchema,
      },
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json(FALLBACK);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(FALLBACK);
    }

    return NextResponse.json(normalizeOcrPayload(parsed));
  } catch (error) {
    console.error("[ocr-receipt]", error);
    return NextResponse.json(FALLBACK);
  }
}
