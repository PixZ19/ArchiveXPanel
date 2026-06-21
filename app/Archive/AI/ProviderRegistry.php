<?php

namespace Archive\AI;

use Illuminate\Support\Manager;
use InvalidArgumentException;

/**
 * Provider Registry
 * ----------------------------------------------------------------------------
 * Resolves which provider handles a given capability class. The admin configures
 * the routing in config/archive.php — e.g.:
 *
 *   'routing' => [
 *       'light'  => 'dolphin',
 *       'medium' => 'dolphin',
 *       'heavy'  => 'openai',   // route heavy tasks to a more powerful model
 *   ],
 *
 * Future providers (Gemini, OpenAI, OpenRouter, Ollama) register here.
 */
class ProviderRegistry extends Manager
{
    /**
     * Resolve the provider for a capability class.
     */
    public function for(string $capabilityClass): AIProvider
    {
        $routing = config('archive.ai.routing', []);
        $name = $routing[$capabilityClass] ?? 'dolphin';
        return $this->driver($name);
    }

    public function createDolphinDriver(): DolphinProvider
    {
        return new DolphinProvider();
    }

    // Future drivers — uncomment when implemented
    // public function createOpenaiDriver(): OpenAIProvider { ... }
    // public function createGeminiDriver(): GeminiProvider { ... }
    // public function createOllamaDriver(): OllamaProvider { ... }

    public function getDefaultDriver(): string
    {
        return 'dolphin';
    }
}
