<?php

return [
	'panguformat' => [
		'description' => 'Automatically adds spaces between CJK and half-width characters when articles are saved. This makes formatting permanent so it works correctly with the Highlight extension.',
		'migrate_title' => 'Format existing articles',
		'migrate_help' => 'Apply Pangu spacing to all existing articles in the database. This only needs to be done once. New articles will be formatted automatically on import.',
		'migrate_button' => 'Format all existing articles now',
		'migrate_done' => 'Formatted %d articles on %s.',
	],
];
