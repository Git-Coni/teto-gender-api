// dotenv 패키지를 추가하여 환경 변수를 로드합니다.
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();

// .env 파일의 환경 변수를 로드합니다.
dotenv.config();

// 허용할 도메인 목록
const allowedOrigins = ["https://git-coni.github.io", "http://localhost:3000"];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};

app.use(cors(corsOptions));

// JSON 요청 본문(body)을 파싱하기 위한 미들웨어 추가
app.use(express.json());

if (!process.env.GEMINI_API_KEY) {
  console.error("Environment variable GEMINI_API_KEY is not set.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

// GET / 엔드포인트: API 서버의 상태를 반환
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

// POST /api/evaluate 엔드포인트를 Gemini API를 사용하도록 수정
app.post("/api/evaluate", async (req, res) => {
  try {
    const { gender, answers, lang } = req.body;

    const answersString = Object.entries(answers)
      .map(([q, a]) => `${q}: ${a}`)
      .join("\n");

    const prompt = `
        Based on the following gender and answers, please evaluate the user's personality.
        
        Gender: ${gender}
        Answers:
        ${answersString}
        
        Select one of these four personality types: “egen-boy”, “egen-girl”, “teto-boy”, or “teto-girl”.
        
        You must respond in valid JSON with the exact keys: "type", "explanation", "advice", "next_type", and "love_chain_info".  
        - "type": the chosen type.  
        - "explanation": describe how their answers reflect that personality type.  
        - "advice": practical guidance tailored to that type.  
        - "next_type": the next type in the Love Food Chain.  
        - "love_chain_info": explain in detail why this type is drawn to the next type—*from an egen/teto perspective*—following the Love Food Chain dynamics. For example, if "teto-boy" is selected, explain how teto-boys are naturally attracted to egen-girls due to their gentle femininity and sensitivity, and what that implies emotionally and behaviorally.
        
        Language: ${lang}
        
        Example:
        {
          "type": "teto-boy",
          "explanation": "…",
          "advice": "…",
          "next_type": "egen-girl",
          "love_chain_info": "Teto-boys are often attracted to egen-girls because they offer a gentle emotional balance … (and more detailed reasoning)."
        }
      `;

    // 변경사항: AI에게 보내는 프롬프트를 로그로 남깁니다.
    console.log("Sending prompt to AI:", prompt);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // 변경사항: AI의 응답 텍스트를 로그로 남깁니다.
    console.log("Received raw AI response:", text);

    // 응답 텍스트에서 불필요한 마크다운 코드 블록 제거
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

// GET /api/translations 엔드포인트 추가
app.get("/api/translations", async (req, res) => {
  try {
    const langCode = req.query.lang || "ko";

    const connection = await mysql.createConnection(dbConfig);

    const [rows] = await connection.execute(
      `SELECT key_name, translated_text FROM i18n WHERE lang_code = ?`,
      [langCode]
    );
    connection.end();

    const translations = rows.reduce((acc, row) => {
      acc[row.key_name] = row.translated_text;
      return acc;
    }, {});

    res.json(translations);
  } catch (error) {
    console.error("Database query error:", error);
    res.status(500).json({ error: "Failed to retrieve translations." });
  }
});

app.get("/api/test", (req, res) => {
  res.json({ msg: "API call successful!", time: new Date().toISOString() });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`API server is running → http://localhost:${PORT}`)
);
