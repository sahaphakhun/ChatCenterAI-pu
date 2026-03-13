/**
 * Instruction RAG Service
 * Hybrid search: Keyword + Embedding (text-embedding-3-large)
 * Phase 2: Semantic search with cosine similarity
 */

class InstructionRAGService {
    constructor(openaiClient) {
        this.openai = openaiClient || null;
        this.index = [];          // text entries for keyword search
        this.embeddings = [];     // { entry, vector } pairs
        this._embeddingsReady = false;
        this._embeddingPromise = null;
        this.EMBEDDING_MODEL = "text-embedding-3-large";
        this.EMBEDDING_DIMENSIONS = 256; // compact for speed, still high quality
    }

    /**
     * Build index from instruction data items (synchronous — keyword only)
     */
    buildIndex(instruction) {
        this.index = [];
        this.embeddings = [];
        this._embeddingsReady = false;
        this._embeddingPromise = null;

        if (!instruction || !Array.isArray(instruction.dataItems)) return;

        for (const item of instruction.dataItems) {
            if (item.type === "table" && item.data) {
                const { columns, rows } = item.data;
                if (!Array.isArray(columns) || !Array.isArray(rows)) continue;

                rows.forEach((row, rowIndex) => {
                    if (!Array.isArray(row)) return;
                    const obj = {};
                    columns.forEach((col, ci) => {
                        obj[col || `Column ${ci + 1}`] = row[ci] !== undefined && row[ci] !== null ? String(row[ci]) : "";
                    });
                    const content = Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(" | ");
                    this.index.push({
                        itemId: item.itemId,
                        itemTitle: item.title || "Untitled",
                        type: "table",
                        matchType: "row",
                        rowIndex,
                        rowData: obj,
                        content,
                    });
                });

                // Index column names
                this.index.push({
                    itemId: item.itemId,
                    itemTitle: item.title || "Untitled",
                    type: "table",
                    matchType: "columns",
                    content: columns.join(" | "),
                    columns,
                });

            } else if (item.type === "text" && item.content) {
                const text = String(item.content);
                const chunkSize = 500;
                const overlap = 50;
                for (let i = 0; i < text.length; i += (chunkSize - overlap)) {
                    const chunk = text.substring(i, i + chunkSize);
                    this.index.push({
                        itemId: item.itemId,
                        itemTitle: item.title || "Untitled",
                        type: "text",
                        matchType: "text_chunk",
                        charRange: [i, Math.min(i + chunkSize, text.length)],
                        content: chunk,
                    });
                }
            }
        }
    }

    // ─────────────────────── Embedding Helpers ───────────────────────

    /**
     * Embed a batch of texts using text-embedding-3-large
     */
    async _embedBatch(texts) {
        if (!this.openai || !texts.length) return [];
        try {
            const response = await this.openai.embeddings.create({
                model: this.EMBEDDING_MODEL,
                dimensions: this.EMBEDDING_DIMENSIONS,
                input: texts,
            });
            return response.data.map(d => d.embedding);
        } catch (err) {
            console.error("[RAG] Embedding error:", err.message);
            return [];
        }
    }

    /**
     * Embed a single query
     */
    async _embedQuery(query) {
        const vecs = await this._embedBatch([query]);
        return vecs[0] || null;
    }

    /**
     * Cosine similarity between two vectors
     */
    _cosineSimilarity(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }

    /**
     * Build embeddings for all indexed entries (async, batched)
     * Call this once after buildIndex — runs in background
     */
    async buildEmbeddings() {
        if (!this.openai) return;

        const searchable = this.index.filter(e => e.matchType !== "columns");
        if (!searchable.length) return;

        // Batch embed (max 2048 per batch for API)
        const BATCH_SIZE = 512;
        this.embeddings = [];

        for (let i = 0; i < searchable.length; i += BATCH_SIZE) {
            const batch = searchable.slice(i, i + BATCH_SIZE);
            const texts = batch.map(e => e.content.substring(0, 512)); // Trim to keep tokens manageable
            const vectors = await this._embedBatch(texts);

            for (let j = 0; j < batch.length; j++) {
                if (vectors[j]) {
                    this.embeddings.push({ entry: batch[j], vector: vectors[j] });
                }
            }
        }

        this._embeddingsReady = this.embeddings.length > 0;
        console.log(`[RAG] Built ${this.embeddings.length} embeddings using ${this.EMBEDDING_MODEL} (dim=${this.EMBEDDING_DIMENSIONS})`);
    }

    /**
     * Start building embeddings in the background (non-blocking)
     */
    startEmbeddingBuild() {
        if (!this.openai) return;
        this._embeddingPromise = this.buildEmbeddings().catch(err => {
            console.error("[RAG] Background embedding build failed:", err.message);
        });
    }

    /**
     * Wait for embeddings to be ready (with timeout)
     */
    async waitForEmbeddings(timeoutMs = 10000) {
        if (this._embeddingsReady) return true;
        if (!this._embeddingPromise) return false;
        try {
            await Promise.race([
                this._embeddingPromise,
                new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
            ]);
            return this._embeddingsReady;
        } catch {
            return this._embeddingsReady;
        }
    }

    // ─────────────────────── Search Methods ───────────────────────

    /**
     * Keyword-based search (Phase 1 — always available)
     */
    searchKeyword(query, limit = 5) {
        if (!query || !this.index.length) return [];
        const q = query.toLowerCase().trim();
        const keywords = q.split(/\s+/).filter(Boolean);

        const scored = [];

        for (const entry of this.index) {
            if (entry.matchType === "columns") continue;
            const text = entry.content.toLowerCase();

            let score = 0;

            // Exact phrase match
            if (text.includes(q)) score += 10;

            // Individual keyword matching
            for (const kw of keywords) {
                if (text.includes(kw)) score += 3;
                const words = text.split(/[\s|,;:]+/);
                for (const w of words) {
                    if (w.includes(kw) || kw.includes(w)) score += 1;
                }
            }

            if (score > 0) {
                scored.push({ entry, score: Math.min(score / (10 + keywords.length * 3), 1.0) });
            }
        }

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, limit).map(s => this._formatResult(s.entry, s.score, "keyword"));
    }

    /**
     * Embedding-based semantic search (Phase 2)
     */
    async searchSemantic(query, limit = 5) {
        if (!this._embeddingsReady || !this.embeddings.length) return [];

        const queryVec = await this._embedQuery(query);
        if (!queryVec) return [];

        const scored = this.embeddings.map(({ entry, vector }) => ({
            entry,
            score: this._cosineSimilarity(queryVec, vector),
        }));

        scored.sort((a, b) => b.score - a.score);

        // Filter low-relevance results (threshold 0.25)
        return scored
            .filter(s => s.score > 0.25)
            .slice(0, limit)
            .map(s => this._formatResult(s.entry, s.score, "semantic"));
    }

    /**
     * Hybrid search: combine keyword + semantic, dedup, re-rank
     */
    async search(query, limit = 5) {
        // Always run keyword search
        const keywordResults = this.searchKeyword(query, limit * 2);

        // Try semantic search if embeddings are ready
        let semanticResults = [];
        if (this._embeddingsReady && this.openai) {
            try {
                semanticResults = await this.searchSemantic(query, limit * 2);
            } catch (err) {
                console.error("[RAG] Semantic search error:", err.message);
            }
        }

        // If no semantic results, return keyword results
        if (!semanticResults.length) {
            return keywordResults.slice(0, limit);
        }

        // Merge & deduplicate using Reciprocal Rank Fusion (RRF)
        const K = 60; // RRF constant
        const scoreMap = new Map(); // key: "itemId:matchType:rowIndex|charRange" -> { result, score }

        const addResults = (results, startRank) => {
            results.forEach((result, idx) => {
                const key = this._resultKey(result);
                const rrfScore = 1 / (K + startRank + idx);
                if (scoreMap.has(key)) {
                    const existing = scoreMap.get(key);
                    existing.score += rrfScore;
                    // Keep the higher relevance score
                    if (result.relevanceScore > existing.result.relevanceScore) {
                        existing.result = result;
                    }
                } else {
                    scoreMap.set(key, { result, score: rrfScore });
                }
            });
        };

        addResults(keywordResults, 0);
        addResults(semanticResults, 0);

        // Sort by combined RRF score
        const fused = Array.from(scoreMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(({ result, score }) => {
                // Normalize final score to 0-1 range
                result.relevanceScore = Math.round(Math.min(score * K, 1.0) * 100) / 100;
                result.searchMethod = "hybrid";
                return result;
            });

        return fused;
    }

    // ─────────────────────── Helpers ───────────────────────

    _resultKey(result) {
        if (result.matchType === "row") return `${result.itemId}:row:${result.rowIndex}`;
        if (result.matchType === "text_chunk") return `${result.itemId}:text:${result.charRange?.join("-")}`;
        return `${result.itemId}:${result.matchType}:${Math.random()}`;
    }

    _formatResult(entry, score, method) {
        const result = {
            itemId: entry.itemId,
            itemTitle: entry.itemTitle,
            type: entry.type,
            matchType: entry.matchType,
            relevanceScore: Math.round(score * 100) / 100,
            searchMethod: method,
        };

        if (entry.matchType === "row") {
            result.rowIndex = entry.rowIndex;
            result.snippet = entry.rowData;
        } else if (entry.matchType === "text_chunk") {
            result.charRange = entry.charRange;
            // Show first 200 chars of chunk as snippet
            result.snippet = entry.content.substring(0, 200) + (entry.content.length > 200 ? "..." : "");
        }

        return result;
    }
}

module.exports = InstructionRAGService;
