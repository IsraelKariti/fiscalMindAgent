-- Cache-write tokens, cache lifetime and raw usage (openspec `llm-call-cache-usage`).
-- Anthropic requests now ask for prompt caching. A call that writes the cache
-- is billed for those tokens above the input rate (1.25x for a 5-minute
-- lifetime, 2x for 1 hour), a category the call log could not show: the
-- tokens were folded into plain input and priced at the input rate.
--
-- llm_calls:
--   cache_write_tokens           tokens the call wrote into the provider's
--                                cache; a SUBSET of input_tokens, like
--                                cached_tokens. 0 on other providers, on
--                                failed calls and on older rows.
--   cache_write_price_per_token  the cache-write rate that applied; NULL when
--                                the request carried no cache request.
--   cache_ttl                    the lifetime the request asked for: '5m',
--                                '1h', or NULL when it asked for no cache.
--   raw_usage                    the provider's usage block(s) as returned,
--                                one per model turn, in turn order; NULL on
--                                failed calls and on older rows.
ALTER TABLE llm_calls ADD COLUMN cache_write_tokens BIGINT NOT NULL DEFAULT 0;
ALTER TABLE llm_calls ADD COLUMN cache_write_price_per_token DOUBLE PRECISION;
ALTER TABLE llm_calls ADD COLUMN cache_ttl TEXT CHECK (cache_ttl IN ('5m', '1h'));
ALTER TABLE llm_calls ADD COLUMN raw_usage JSONB;

-- The usage totals keep one count per lifetime: a total can mix both (the
-- admin can change the setting mid-day) and the two have different prices.
-- Both are subsets of input_tokens.
ALTER TABLE llm_model_usage ADD COLUMN cache_write_5m_tokens BIGINT NOT NULL DEFAULT 0;
ALTER TABLE llm_model_usage ADD COLUMN cache_write_1h_tokens BIGINT NOT NULL DEFAULT 0;
ALTER TABLE llm_usage_daily ADD COLUMN cache_write_5m_tokens BIGINT NOT NULL DEFAULT 0;
ALTER TABLE llm_usage_daily ADD COLUMN cache_write_1h_tokens BIGINT NOT NULL DEFAULT 0;
