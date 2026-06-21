<?php

namespace Archive\AI;

/**
 * AI Provider Contract
 * ----------------------------------------------------------------------------
 * Every provider (Dolphin, OpenAI, Gemini, OpenRouter, Ollama) implements
 * this contract. The Gateway routes a request to the appropriate provider
 * based on the requested capability + admin routing configuration.
 *
 * The frontend NEVER calls providers directly. It calls the Gateway, which:
 *   - authenticates the user
 *   - resolves the active provider
 *   - applies rate limits + audit logging
 *   - proxies the request
 *   - streams the response back
 */
interface AIProvider
{
    /**
     * One-shot chat completion. Returns the full response text.
     *
     * @param array $messages  [{role, content}, ...]
     * @param array $options   {template, max_tokens, temperature, ...}
     */
    public function chat(array $messages, array $options = []): string;

    /**
     * Streaming chat completion. Yields chunks as they arrive.
     * Implementations should use PHP generators to stream.
     *
     * @return \Generator<string>  Yields chunks of response text.
     */
    public function stream(array $messages, array $options = []): \Generator;

    /**
     * Cancel an in-flight request. Best-effort — providers that don't
     * support cancellation should silently no-op.
     */
    public function cancel(string $requestId): void;

    /**
     * Advertise capabilities so the Gateway can route appropriately.
     */
    public function capabilities(): ProviderCapabilities;

    /**
     * Human-readable identifier for audit logs.
     */
    public function id(): string;
}
