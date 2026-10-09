// app/api/ocr/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const { imageBase64, rowRange } = await req.json();

    if (!imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 wajib dikirim" },
        { status: 400 },
      );
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY belum diset di .env.local" },
        { status: 500 },
      );
    }

    const rangeInstruction = rowRange
      ? `\nPENTING: Baca HANYA ${rowRange} (lihat kolom "NO"). Abaikan baris di luar itu.`
      : "";

    const prompt = `Baca lembar nilai formatif. Kolom: NO | NAMA | NIS | TP x (sub-kolom K1..K4).

TUGAS:
1. Deteksi TP mana yang terisi tulisan tangan + jumlah sub-kolom K.
2. Baca NIS tiap siswa (8-12 digit).
3. Baca angka di tiap kolom K (tulisan tangan, biasanya 60-95).

KARAKTERISTIK TULISAN TANGAN INDONESIA:
- "1" vs "7": cek ada garis horizontal atas atau tidak
- "4" vs "9": 9 lebih melingkar, 4 ada garis horizontal
- "5" vs "6": 5 ada garis atas, 6 tidak
- "0" vs "6": 0 lebih oval, 6 ada ekor bawah
- Bila ragu, pilih angka yang paling konsisten dengan nilai lain di kelas.

OUTPUT: JSON MURNI, TANPA SPASI/INDENTASI/NEWLINE. Format persis:
{"t":1,"k":3,"r":[["262701009",null,80,90],["262701015",85,90,88]]}

KETERANGAN:
- "t" = nomor TP yang terisi (angka saja, contoh 1 untuk TP 1)
- "k" = jumlah sub-kolom K pada TP tersebut (1-4)
- "r" = array baris; tiap baris = [NIS, K1, K2, K3, K4]
- Panjang array tiap baris = 1 + k. Contoh k=3 → [NIS,K1,K2,K3].
- Nilai tidak terbaca → null
- Skip baris tanpa NIS.
- Kalau tidak ada nilai → {"t":0,"k":0,"r":[]}.${rangeInstruction}`;

    async function callGroq() {
      return fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "qwen/qwen3.8-27b",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: imageBase64 } },
              ],
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
          max_completion_tokens: 500,
        }),
      });
    }

    let res = await callGroq();

    if (res.status === 429) {
      console.log("Groq 429, retry dalam 15 detik...");
      await new Promise((r) => setTimeout(r, 15000));
      res = await callGroq();
    }
    if (res.status === 429) {
      console.log("Groq 429 lagi, retry dalam 30 detik...");
      await new Promise((r) => setTimeout(r, 30000));
      res = await callGroq();
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("Groq error:", errText);
      return NextResponse.json(
        {
          error: `Groq error (${res.status}): ${errText.slice(0, 300)}. Tunggu 1 menit lalu scan lagi.`,
        },
        { status: 500 },
      );
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const tpNum = Number(parsed.t) || 0;
    const kCount = Number(parsed.k) || 0;
    const rawRows = Array.isArray(parsed.r) ? parsed.r : [];

    const rows = rawRows
      .map((arr) => {
        if (!Array.isArray(arr)) return null;
        const nis = String(arr[0] || "").replace(/\D/g, "");
        if (!nis) return null;
        const values = arr.slice(1).map((v) => {
          if (v === null || v === undefined || v === "") return null;
          const n = Number(v);
          return isNaN(n) ? null : n;
        });
        while (values.length < kCount) values.push(null);
        return { nis, values: values.slice(0, kCount) };
      })
      .filter(Boolean);

    return NextResponse.json({
      tp: tpNum > 0 ? `TP ${tpNum}` : null,
      kCount,
      rows,
    });
  } catch (error) {
    console.error("API OCR error:", error);
    return NextResponse.json(
      { error: error?.message || "Gagal memproses" },
      { status: 500 },
    );
  }
}
