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
// const { OpenAI } = require("openai");

/*
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
            attributes: ['verse', 'text'],
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



