<?php

namespace Archive\Http\Controllers;

use Archive\AI\ProviderRegistry;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * AI Gateway Controller
 * ----------------------------------------------------------------------------
 * The single HTTP entry point the frontend uses for AI requests.
 * Frontend NEVER calls provider endpoints directly — it always goes through
 * this controller, which enforces auth, RBAC, rate-limit, audit, and routing.
 *
 * Routes:
 *   POST /api/archive/ai/chat    — one-shot
 *   POST /api/archive/ai/stream  — SSE stream
 *   POST /api/archive/ai/cancel  — cancel in-flight request
 */
class AIGatewayController extends Controller
{
    public function __construct(
        private ProviderRegistry $registry,
    ) {
        $this->middleware(['auth', 'throttle:archive-ai']);
    }

    /**
     * One-shot chat. Returns the full response as JSON.
     */
    public function chat(Request $request)
    {
        $data = $request->validate([
            'messages'   => ['required', 'array', 'min:1'],
            'messages.*.role'    => ['required', 'string', 'in:system,user,assistant'],
            'messages.*.content' => ['required', 'string'],
            'capability' => ['required', 'string', 'in:light,medium,heavy'],
            'options'    => ['array'],
        ]);

        $provider = $this->registry->for($data['capability']);

        $this->audit($request, 'ai.chat', $data['capability']);

        try {
            $response = $provider->chat($data['messages'], $data['options'] ?? []);
            return response()->json([
                'content'    => $response,
                'provider'   => $provider->id(),
                'capability' => $data['capability'],
            ]);
        } catch (\Throwable $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }
    }

    /**
     * Streaming chat. Returns an SSE stream.
     */
    public function stream(Request $request): StreamedResponse
    {
        $data = $request->validate([
            'messages'   => ['required', 'array', 'min:1'],
            'messages.*.role'    => ['required', 'string', 'in:system,user,assistant'],
            'messages.*.content' => ['required', 'string'],
            'capability' => ['required', 'string', 'in:light,medium,heavy'],
            'options'    => ['array'],
        ]);

        $provider = $this->registry->for($data['capability']);
        $requestId = \Str::uuid()->toString();

        $this->audit($request, 'ai.stream', $data['capability'], $requestId);

        return new StreamedResponse(function () use ($provider, $data, $requestId) {
            // Disable time limit for streaming
            set_time_limit(0);

            try {
                foreach ($provider->stream($data['messages'], $data['options'] ?? []) as $chunk) {
                    echo "data: " . json_encode([
                        'id'      => $requestId,
                        'chunk'   => $chunk,
                    ]) . "\n\n";

                    // Flush to send immediately
                    if (ob_get_level() > 0) ob_flush();
                    flush();
                }
                echo "data: [DONE]\n\n";
            } catch (\Throwable $e) {
                echo "data: " . json_encode([
                    'id'    => $requestId,
                    'error' => $e->getMessage(),
                ]) . "\n\n";
            }
        }, 200, [
            'Content-Type'      => 'text/event-stream',
            'Cache-Control'     => 'no-cache, no-transform',
            'X-Accel-Buffering' => 'no', // nginx — don't buffer
            'Connection'        => 'keep-alive',
        ]);
    }

    /**
     * Cancel an in-flight streaming request.
     */
    public function cancel(Request $request)
    {
        $data = $request->validate([
            'request_id' => ['required', 'string'],
            'capability' => ['required', 'string', 'in:light,medium,heavy'],
        ]);

        $provider = $this->registry->for($data['capability']);
        $provider->cancel($data['request_id']);

        return response()->json(['cancelled' => true]);
    }

    /**
     * Write an audit log entry. Reuses Pterodactyl's activity log system
     * so AI requests show up in the existing audit timeline.
     */
    private function audit(Request $request, string $event, string $capability, ?string $requestId = null): void
    {
        activity()
            ->withProperties([
                'capability'  => $capability,
                'provider'    => $this->registry->for($capability)->id(),
                'request_id'  => $requestId,
                'message_count' => count($request->input('messages', [])),
            ])
            ->log($event);
    }
}
