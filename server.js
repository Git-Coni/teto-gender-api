// dotenv 패키지를 추가하여 환경 변수를 로드합니다.
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
// 변경사항: OpenAI API 패키지 대신 Google Generative AI 패키지를 사용합니다.
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();

const FRONTEND = "https://git-coni.github.io";
app.use(cors({ origin: FRONTEND }));

// 변경사항: JSON 요청 본문(body)을 파싱하기 위한 미들웨어 추가
app.use(express.json());

// .env 파일의 환경 변수를 로드합니다.
// 변경사항: 환경 변수를 사용하도록 수정
dotenv.config();

// 변경사항: OpenAI API 키 대신 Gemini API 키 환경 변수 확인
if (!process.env.GEMINI_API_KEY) {
  console.error("Environment variable GEMINI_API_KEY is not set.");
  process.exit(1);
}

// 변경사항: Gemini API 클라이언트를 초기화합니다.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// 변경사항: 모델명을 'gemini-2.5-flash'로 변경
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

// GET / 엔드포인트: API 서버의 상태를 반환
// 변경사항: 루트 경로에 대한 응답을 추가함
app.get("/", (req, res) => {
  res.json({
    status: "API server is running.",
    endpoints: ["/api/questions", "/api/evaluate"],
  });
});

// GET /api/questions 엔드포인트: DB에서 다국어 질문을 가져와 반환
app.get("/api/questions", async (req, res) => {
  try {
    const langCode = req.query.lang || "ko";

    const connection = await mysql.createConnection(dbConfig);

    const sql = `
      SELECT
          q.id,
          q.step,
          question_i18n.translated_text AS question,
          options_i18n.translated_text AS options
      FROM
          teto_gender_questions AS q
      JOIN
          i18n AS question_i18n
      ON
          q.question_key = question_i18n.key_name AND question_i18n.lang_code = ?
      JOIN
          i18n AS options_i18n
      ON
          q.options_key = options_i18n.key_name AND options_i18n.lang_code = ?
      ORDER BY
          q.step, q.id;
    `;

    const [rows] = await connection.execute(sql, [langCode, langCode]);
    connection.end();

    res.json(rows);
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Failed to retrieve question data." });
  }
});

// 변경사항: POST /api/evaluate 엔드포인트를 Gemini API를 사용하도록 수정
app.post("/api/evaluate", async (req, res) => {
  try {
    const { gender, answers, lang } = req.body;

    // 답변 객체를 문자열로 변환하여 프롬프트에 포함
    const answersString = Object.entries(answers)
      .map(([q, a]) => `${q}: ${a}`)
      .join("\n");

    // 변경사항: Gemini 프롬프트에 언어 정보, 타입 목록, 연애 먹이사슬 정보를 추가합니다.
    const prompt = `
      Based on the following gender and answers, provide a personality evaluation.
      Gender: ${gender}
      Answers:
      ${answersString}

      Evaluate the user and provide a personality type from these four options: 'egen-boy', 'egen-girl', 'teto-boy', 'teto-girl'.
      
      The personality types follow a "Love Food Chain" circulation structure:
      Egen-girl → Egen-boy → Teto-girl → Teto-boy → Egen-girl
      
      Provide a specific explanation for how the determined type fits into this Love Food Chain, based on the following example:
      Example for teto-boy: "테토남은 자신에게 없는 부드러운 여성성과 섬세한 감수성을 지닌 에겐녀에게 호감을 느낀다. 테토녀에게도 외형적 매력이나 활기 측면에서 끌릴 수 있지만, 두 사람 모두 양기 성향이 강해 갈등이 잦거나 주도권을 두고 충돌하는 경우가 있다."

      Please respond in a JSON format with 'type', 'explanation', 'advice', 'next_type', and 'love_chain_info'.
      'next_type' should be the next type in the Love Food Chain based on the determined 'type'.
      The response must be in the requested language.
      Language: ${lang}

      Example:
      {
          "type": "egen-boy",
          "explanation": "...",
          "advice": "...",
          "next_type": "teto-girl",
          "love_chain_info": "..."
      }
    `;

    // 변경사항: AI에게 보내는 프롬프트를 로그로 남깁니다.
    console.log("Sending prompt to AI:", prompt);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // 변경사항: AI의 응답 텍스트를 로그로 남깁니다.
    console.log("Received raw AI response:", text);

    // 변경사항: 응답 텍스트에서 불필요한 마크다운 코드 블록 제거
    if (text.startsWith("```json")) {
      text = text.replace("```json", "").replace("```", "").trim();
    }

    const parsedResult = JSON.parse(text);

    res.json(parsedResult);
  } catch (error) {
    console.error("API call or JSON parsing error:", error);
    res.status(500).json({ error: "Failed to process evaluation." });
  }
});

app.get("/api/test", (req, res) => {
  res.json({ msg: "API call successful!", time: new Date().toISOString() });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`API server is running → http://localhost:${PORT}`)
);
