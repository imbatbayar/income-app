// app/api/dev-review/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs"; // OpenAI SDK-т илүү найдвартай

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { code, instruction } = body || {};

    if (!code || !instruction) {
      return NextResponse.json(
        { error: "code болон instruction хоёул заавал хэрэгтэй." },
        { status: 400 }
      );
    }

    // API key байхгүй үед шууд ойлгомжтой хариу өгөх (алдаа цацахгүй)
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          result:
            "OPENAI_API_KEY тохируулагдаагүй байна. .env.local дотор OPENAI_API_KEY=... гэж нэмээд dev серверээ дахин асаана уу.",
        },
        { status: 200 }
      );
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    });

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Та туршлагатай full-stack инженер. Өгөгдсөн кодыг эвдэлгүйгээр алдаа, сайжруулалт, рефактор, архитектурын зөвлөгөө өгнө.",
        },
        {
          role: "user",
          content: `
=== АСУУЛТ / ЗААВАР ===
${instruction}

=== КОД ===
${code}
          `,
        },
      ],
    });

    const result = response.choices?.[0]?.message?.content || "No response";

    return NextResponse.json({ result }, { status: 200 });
  } catch (err) {
    console.error("DEV-REVIEW ERROR:", err);
    return NextResponse.json(
      { error: "Серверийн алдаа (dev-review route)." },
      { status: 500 }
    );
  }
}
