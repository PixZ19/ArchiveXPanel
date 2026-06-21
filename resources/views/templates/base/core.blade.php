{*
 * Archive Panel — Base Core Template
 * ----------------------------------------------------------------------------
 * Overrides Pterodactyl's templates/base/core.blade.php to mount the Archive
 * React app instead of Pterodactyl's. Other Pterodactyl views (auth, admin,
 * errors) stay intact and continue to work because we only override this file.
 *}
@extends('templates.wrapper', [
    'css' => ['body' => 'bg-bg'],
])

@section('container')
    <div id="modal-portal"></div>
    <div id="root"></div>
@endsection
