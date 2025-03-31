require("dotenv").config();
const redisClient = require("../../config/redis");
const {
    sendError,
    sendSuccess,
    getToken,
    sendErrorUnauthorized,
    decodeToken
} = require("../../utils/methods");

const BibleVerseWeb = require("../models/BibleVerseWeb");
const { Sequelize } = require("sequelize");
const sequelize = require("../../config/db");

/*
const { OpenAI } = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
*/


// 📖 Fetch verses by language, book, chapter (strict required + cache)
exports.list = async (req, res) => {
    const token = getToken(req.headers);
    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

    try {
        decodeToken(token); // optional user context

        const { language, book, chapter, search, pageIndex, pageSize } = req.query;
        const lang = (language || "eng").trim().toLowerCase();

        // ✅ SEARCH MODE (overrides book/chapter)
        if (search) {
            const keyword = search.trim();
            if (keyword.length < 2) {
                return sendError(res, "", "Search query must be at least 2 characters.");
            }

            // Pagination defaults + safety limits
            const page = Math.max(parseInt(pageIndex) || 0, 0);
            const size = Math.min(parseInt(pageSize) || 20, 100);
            const offset = page * size;

            // ✅ COUNT using raw SQL with FULLTEXT
            const countResult = await sequelize.query(
                `SELECT COUNT(*) AS count FROM bible_verses_web 
                 WHERE language = ${sequelize.escape(lang)} 
                 AND MATCH(text) AGAINST (${sequelize.escape(keyword)} IN BOOLEAN MODE)`,
                { type: sequelize.QueryTypes.SELECT }
            );
            const totalRecords = countResult[0]?.count || 0;

            if (totalRecords === 0) {
                return sendSuccess(res, {
                    results: [],
                    pageIndex: page,
                    pageSize: size,
                    totalRecords: 0
                });
            }

            // ✅ Paginated Results using FULLTEXT
            const results = await BibleVerseWeb.findAll({
                attributes: ['book', 'chapter', 'verse', 'language', 'text'],
                where: Sequelize.literal(`
                    language = ${sequelize.escape(lang)} 
                    AND MATCH(text) AGAINST (${sequelize.escape(keyword)} IN BOOLEAN MODE)
                `),
                order: [['book', 'ASC'], ['chapter', 'ASC'], ['verse', 'ASC']],
                offset,
                limit: size,
                raw: true
            });

            return sendSuccess(res, {
                results,
                pageIndex: page,
                pageSize: size,
                totalRecords
            });
        }

        // ✅ DEFAULT MODE — fetch by book & chapter with Redis cache
        if (!language || !book || !chapter) {
            return sendError(res, "", "Missing required query parameters: language, book, and chapter are all required.");
        }

        const bookNum = parseInt(book);
        const chapterNum = parseInt(chapter);

        if (
            lang.length > 10 ||
            isNaN(bookNum) || isNaN(chapterNum) ||
            bookNum < 1 || chapterNum < 1
        ) {
            return sendError(res, "", "Invalid query parameter values.");
        }

        const cacheKey = `bible:${lang}:book${bookNum}:chapter${chapterNum}`;
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            return sendSuccess(res, JSON.parse(cached), "From cache");
        }

        const verses = await BibleVerseWeb.findAll({
            attributes: ['verse', 'text', 'commentary'],
            where: {
                language: lang,
                book: bookNum,
                chapter: chapterNum
            },
            order: [['verse', 'ASC']],
            raw: true
        });

        const response = {
            language: lang,
            book: bookNum,
            chapter: chapterNum,
            verses
        };

        await redisClient.set(cacheKey, JSON.stringify(response), 'EX', 3600); // Cache for 1 hour

        return sendSuccess(res, response);
    } catch (err) {
        console.error("Bible list error:", err);
        return sendError(res, "", "Failed to fetch Bible verses.");
    }
};

exports.getVerse = async (req, res) => {
  try {
    const { book, chapter, verse, language } = req.params;

    const bookNum = parseInt(book);
    const chapterNum = parseInt(chapter);
    const verseNum = parseInt(verse);
    const lang = language?.trim().toLowerCase();

    if (
      isNaN(bookNum) || isNaN(chapterNum) || isNaN(verseNum) ||
      !lang || lang.length > 10
    ) {
      return sendError(res, "", "Invalid parameters.");
    }

    const cacheKey = `bible:verse:${lang}:${bookNum}:${chapterNum}:${verseNum}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return sendSuccess(res, JSON.parse(cached), "From cache");
    }

    const bibleVerse = await BibleVerseWeb.findOne({
      where: {
        book: bookNum,
        chapter: chapterNum,
        verse: verseNum,
        language: lang
      },
      raw: true
    });

    if (!bibleVerse) {
      return sendError(res, "", "Verse not found.");
    }

    // Clean up commentary if needed
    const formattedCommentary = bibleVerse.commentary?.trim() || null;

    const result = {
      book: bibleVerse.book,
      chapter: bibleVerse.chapter,
      verse: bibleVerse.verse,
      text: bibleVerse.text,
      commentary: formattedCommentary
    };

    await redisClient.set(cacheKey, JSON.stringify(result), "EX", 3600); // 1 hour cache
    return sendSuccess(res, result);
  } catch (error) {
    console.error("getVerse error:", error.message);
    return sendError(res, "", "Failed to fetch Bible verse.");
  }
};

/*
exports.translate = async (req, res) => {
    const token = getToken(req.headers);
    if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

    try {
        decodeToken(token);

        // Get ALL English verses from book 1 to 66
        const englishVerses = await BibleVerseWeb.findAll({
            where: {
                language: "eng",
                book: { [Op.between]: [1, 66] }
            },
            order: [['book', 'ASC'], ['chapter', 'ASC'], ['verse', 'ASC']],
            raw: true
        });

        if (!englishVerses.length) {
            return sendError(res, "", "No English verses found.");
        }

        const chunkSize = 5;
        let translatedCount = 0;

        for (let i = 0; i < englishVerses.length; i += chunkSize) {
            const chunk = englishVerses.slice(i, i + chunkSize);

            // Check for existing translations in 'fil'
            const untranslated = [];
            for (const verse of chunk) {
                const exists = await BibleVerseWeb.findOne({
                    where: {
                        language: "fil",
                        book: verse.book,
                        chapter: verse.chapter,
                        verse: verse.verse
                    }
                });

                if (!exists) untranslated.push(verse);
            }

            if (!untranslated.length) {
                console.log(`⏩ Skipped chunk ${i / chunkSize + 1} (already translated)`);
                continue;
            }

            const combinedText = untranslated.map(v => v.text).join('\n');

            const gptResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "You are a Bible translator. Translate the following English Bible verses into Filipino. Return only the translated text, one line per verse, matching the order. Do not include verse numbers or labels."
                    },
                    {
                        role: "user",
                        content: combinedText
                    }
                ],
                temperature: 0.3
            });

            const lines = gptResponse.choices[0].message.content.trim().split('\n').filter(line => line.trim() !== '');

            const filVerses = untranslated.map((v, index) => ({
                language: "fil",
                book: v.book,
                chapter: v.chapter,
                verse: v.verse,
                text: lines[index]?.trim() || ''
            }));

            await BibleVerseWeb.bulkCreate(filVerses);
            translatedCount += filVerses.length;

            console.log(`✅ Translated chunk ${Math.floor(i / chunkSize) + 1}: ${filVerses.length} verses`);
        }

        return sendSuccess(res, {
            total: translatedCount,
            message: "All English Bible verses from Book 1–66 translated into Filipino."
        });
    } catch (error) {
        console.error("Translation error:", error.message);
        return sendError(res, "", "Translation process failed.");
    }
};
*/

/*
exports.generateAndAddCommentary = async (req, res) => {
  const token = getToken(req.headers);
  if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

  try {
    decodeToken(token);

    const CHUNK_SIZE = 10;

    const systemPrompt = `Summarize the spiritual and theological meaning of this verse using public domain commentaries like Matthew Henry and Barnes. Summarize into conversational and doctrinally sound Tagalog. Begin with a brief context of the verse. You can site other verses to strengthen the truth. Give practical example of how will it be applied to our daily lives. Give one question that will lead to creation of their "Ano ang aking gagawin" this is their response of obedience. Don't include titles or label or headline (eg Context of the Verse, Spiritual & Theological Summary) Just mention the reference name like Matthew Henry and Barnes. Make it as one paragraph and don't put any icon or symbols like smiley.

Then make another tagalog paragraph for the "Ano ang aking gagawin” statement.  

This is the sample pattern or format. This is pattern only so the content of “Ano ang aking gagawin” statement varies according to the verse It depends also on the principle that is being taught. 

Here is the example - 

Ano ang aking gagawin:

“Ako ay_____________ ngayong linggo bilang tanda ng aking buong pagsuko at pagiging tunay na kabilang sa pamilya ng Diyos.” 

Note for the above: Don’t forget that this sample of “Ano ang aking gagawin statement are not to be copied. This is just a sample and you should prompt the reader with different kinds depending on the context of the verse. Don’t forget to put the blank line after “ako ay” to give the reader opportunity to think what they will fill-in to that blank. 

Then give the examples of  “ano ang aking gagawin” These must be related to the principle stated. Again this is just examples so don’t copy it.

Mga Halimbawa:
• Ako ay hihinto sa pagsuway at magsisimulang sumunod agad sa mga tagubilin ng Diyos ngayong linggo.
• Ako ay lalapit sa Diyos at hihingi ng tawad sa aking katigasan ng puso ngayong linggo.
• Ako ay makikinig sa tinig ng Diyos at susunod nang may buong pananampalataya ngayong linggo.`;

    const allVerses = await BibleVerseWeb.findAll({
      where: { commentary: null, language: "fil" },
      order: [["id", "ASC"]],
      raw: true
    });

    if (!allVerses.length) {
      return sendSuccess(res, { message: "🎉 All Filipino verses already have commentary." });
    }

    const chunks = [];
    for (let i = 0; i < allVerses.length; i += CHUNK_SIZE) {
      chunks.push(allVerses.slice(i, i + CHUNK_SIZE));
    }

    let completed = 0;
    let skipped = 0;

    for (const chunk of chunks) {
      const results = await Promise.allSettled(
        chunk.map(async (verse) => {
          const gptResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Explain this Bible verse:\n\n"${verse.text}"` }
            ],
            temperature: 0.4
          });

          const commentary = gptResponse.choices?.[0]?.message?.content?.trim();
          if (!commentary) throw new Error("No commentary returned");

          await BibleVerseWeb.update({ commentary }, { where: { id: verse.id } });
          console.log(`✅ Saved commentary for ID ${verse.id}`);
        })
      );

      results.forEach((result, index) => {
        const verseId = chunk[index].id;
        if (result.status === "fulfilled") {
          completed++;
        } else {
          skipped++;
          console.warn(`⚠️ Skipped ID ${verseId} — `, result.reason.message);
        }
      });
    }

    return sendSuccess(res, {
      completed,
      skipped,
      message: `🎯 All Filipino verses processed. ${completed} added, ${skipped} skipped.`
    });

  } catch (error) {
    console.error("❌ Commentary loop error:", error.message);
    return sendError(res, "", "Failed to generate commentaries.");
  }
};

  

exports.generateAndAddCommentaryGemini = async (req, res) => {
  const token = getToken(req.headers);
  if (!token) return sendErrorUnauthorized(res, "", "Please login first.");

  try {
    decodeToken(token);

    const verse = await BibleVerseWeb.findOne({
      where: {
        commentary: null,
        language: "fil"
      },
      order: [["id", "ASC"]],
      raw: true
    });

    if (!verse) {
      return sendSuccess(res, { message: "🎉 All verses already have commentary." });
    }

    const prompt = `
        Summarize the spiritual and theological meaning of this verse using public domain commentaries like Matthew Henry and Barnes. Summarize into conversational and doctrinally sound Tagalog. Begin with a brief context of the verse. You can site other verses to strengthen the truth. Give practical example of how will it be applied to our daily lives. Give one question that will lead to creation of their "Ano ang aking gagawin" this is their response of obedience. Don't include titles or label or headline (eg Context of the Verse, Spiritual & Theological Summary) Just mention the reference name like Matthew Henry and Barnes. Make it as one paragraph and don't put any icon or symbols like smiley.

        Then make another tagalog paragraph for the "Ano ang aking gagawin” statement.  

        This is the sample pattern or format. This is pattern only so the content of “Ano ang aking gagawin” statement varies according to the verse It depends also on the principle that is being taught. Here is the example - 

        Ano ang aking gagawin:

        “Ako ay_____________ ngayong linggo bilang tanda ng aking buong pagsuko at pagiging tunay na kabilang sa pamilya ng Diyos.”

        Then give the examples of “ano ang aking gagawin” 

        Mga Halimbawa:
        • Ako ay hihinto sa pagsuway at magsisimulang sumunod agad sa mga tagubilin ng Diyos ngayong linggo.
        • Ako ay lalapit sa Diyos at hihingi ng tawad sa aking katigasan ng puso ngayong linggo.
        • Ako ay makikinig sa tinig ng Diyos at susunod nang may buong pananampalataya ngayong linggo.
    `;

    const model = genAI.getGenerativeModel({model: "gemini-2.0-flash"});

    const result = await model.generateContent(prompt);
    const response = result.response;
    const commentary = response.text().trim();

    if (!commentary) {
      return sendError(res, "", "⚠️ Gemini API did not return a valid commentary.");
    }

    await BibleVerseWeb.update(
      { commentary },
      { where: { id: verse.id } }
    );

    return sendSuccess(res, {
      id: verse.id,
      language: verse.language,
      reference: `${verse.book}:${verse.chapter}:${verse.verse}`,
      verse: verse.text,
      commentary,
      message: `✅ Commentary saved using Gemini for verse in ${verse.language}.`
    });
  } catch (error) {
    console.error("Gemini commentary error:", error.message);
    return sendError(res, "", "❌ Gemini commentary generation failed.");
  }
};
*/

  
  
  

