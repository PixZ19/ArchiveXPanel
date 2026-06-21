<?php

namespace Archive\AI;

/**
 * Provider capability descriptor. The Gateway uses this to decide whether
 * a provider can handle a given capability class (light / medium / heavy).
 */
class ProviderCapabilities
{
    public function __construct(
        public readonly bool $supportsStreaming,
        public readonly bool $supportsSystemPrompt,
        public readonly bool $supportsToolCalls,
        public readonly int $maxTokens,
        public readonly array $supportedCapabilities, // ['light', 'medium', 'heavy'] etc.
        public readonly int $requestsPerMinute,
    ) {}

    public function canHandle(string $capabilityClass): bool
    {
        return in_array($capabilityClass, $this->supportedCapabilities, true);
    }
}
