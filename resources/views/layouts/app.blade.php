<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'Archive Panel')</title>

    @vite(['resources/scripts/index.tsx'])
</head>
<body>
    <div id="root"></div>
    @stack('scripts')
</body>
</html>
