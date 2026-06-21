<?php

namespace Archive\AI;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Dolphin AI Provider (default)
 * ----------------------------------------------------------------------------
 * Wraps the Dolphin chat endpoint at https://chat.dphn.ai/api/chat using the
 * dolphinserver:24B model. Translates the uniform AIProvider contract into
 * Dolphin's specific request shape and parses SSE chunks.
 *
 * This is the default provider. Other providers (OpenAI, Gemini, OpenRouter,
 * Ollama) follow the same pattern — implement AIProvider, register in
 * ProviderRegistry, route via admin config.
 */
class DolphinProvider implements AIProvider
{
    private const ENDPOINT = 'https://chat.dphn.ai/api/chat';
    private const MODEL    = 'dolphinserver:24B';

    private string $apiKey;
    private int $timeout;

    public function __construct()
    {
        $this->apiKey  = config('archive.ai.dolphin.api_key', '');
        $this->timeout = config('archive.ai.dolphin.timeout', 120);
    }

    public function id(): string
    {
        return 'dolphin';
    }

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities(
            supportsStreaming: true,
            supportsSystemPrompt: true,
            supportsToolCalls: false,
            maxTokens: 8192,
            supportedCapabilities: ['light', 'medium', 'heavy'],
            requestsPerMinute: config('archive.ai.dolphin.rpm', 30),
        );
    }

    public function chat(array $messages, array $options = []): string
    {
        $payload = $this->buildPayload($messages, $options, stream: false);

        $response = Http::withHeaders($this->headers())
            ->timeout($this->timeout)
            ->post(self::ENDPOINT, $payload);

        if (!$response->successful()) {
            Log::error('Dolphin chat failed', [
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);
            throw new \RuntimeException("Dolphin request failed: {$response->status()}");
        }

        $data = $response->json();
        return $data['message']['content'] ?? $data['response'] ?? '';
    }

    public function stream(array $messages, array $options = []): \Generator
    {
        $payload = $this->buildPayload($messages, $options, stream: true);

        $response = Http::withHeaders($this->headers())
            ->timeout($this->timeout)
            ->withOptions(['stream' => true])
            ->post(self::ENDPOINT, $payload);

        if (!$response->successful()) {
            throw new \RuntimeException("Dolphin stream failed: {$response->status()}");
        }

        $body = $response->getBody();
        $buffer = '';

        while (!$body->eof()) {
            $chunk = $body->read(1024);
            if ($chunk === '') break;

            $buffer .= $chunk;
            // SSE format: "data: {...}\n\n"
            while (($pos = strpos($buffer, "\n\n")) !== false) {
                $event = substr($buffer, 0, $pos);
                $buffer = substr($buffer, $pos + 2);

                $parsed = $this->parseSseChunk($event);
                if ($parsed !== null) {
                    yield $parsed;
                }
            }
        }
    }

    public function cancel(string $requestId): void
    {
        // Dolphin supports cancellation via SSE close — PHP process exit handles this.
        // No explicit API call needed.
    }

    // ============ Internal ============

    private function buildPayload(array $messages, array $options, bool $stream): array
    {
        $payload = [
            'messages' => $messages,
            'model'    => self::MODEL,
            'stream'   => $stream,
        ];

        if (isset($options['template'])) {
            $payload['template'] = $options['template'];
        }
        if (isset($options['system'])) {
            array_unshift($payload['messages'], [
                'role'    => 'system',
                'content' => $options['system'],
            ]);
        }

        return $payload;
    }

    private function headers(): array
    {
        $headers = [
            'Accept'       => 'application/json',
            'Content-Type' => 'application/json',
        ];
        if ($this->apiKey) {
            $headers['Authorization'] = "Bearer {$this->apiKey}";
        }
        return $headers;
    }

    private function parseSseChunk(string $event): ?string
    {
        // Look for "data: ..." line
        foreach (explode("\n", $event) as $line) {
            if (str_starts_with($line, 'data:')) {
                $data = trim(substr($line, 5));
                if ($data === '[DONE]') return null;

                $json = json_decode($data, true);
                if (isset($json['message']['content'])) {
                    return $json['message']['content'];
                }
                if (isset($json['response'])) {
                    return $json['response'];
                }
                if (is_string($json)) {
                    return $json;
                }
                return $data;
            }
        }
        return null;
    }
}
