<?php

declare(strict_types=1);

/**
 * PHP port of pangu.js v4.0.7 spacing logic.
 * Source: https://github.com/vinta/pangu.js
 *
 * Applies Pangu formatting at article insert time so the content is
 * permanently formatted in the database, keeping it consistent with
 * what the Highlight extension captures.
 */
final class PanguFormatExtension extends Minz_Extension {

	// ── Character class: CJK (identical to pangu.js) ──────────────────
	private const CJK = '\x{2E80}-\x{2EFF}\x{2F00}-\x{2FDF}\x{3040}-\x{309F}'
		. '\x{30A0}-\x{30FA}\x{30FC}-\x{30FF}\x{3100}-\x{312F}'
		. '\x{3200}-\x{32FF}\x{3400}-\x{4DBF}\x{4E00}-\x{9FFF}\x{F900}-\x{FAFF}';

	#[\Override]
	public function init(): void {
		parent::init();
		$this->registerTranslates();
		$this->registerHook('entry_before_insert', [$this, 'formatEntry']);
	}

	public function formatEntry(FreshRSS_Entry $entry): FreshRSS_Entry {
		$content = $entry->content(false);
		if ($content !== '') {
			$entry->_content(self::spacingHTML($content));
		}
		$title = $entry->title();
		if ($title !== '') {
			$entry->_title(self::spacingText($title));
		}
		return $entry;
	}

	// ── convertToFullwidth (pangu.js line 622-624) ────────────────────
	private static function convertToFullwidth(string $symbols): string {
		return strtr($symbols, [
			'~' => '～', '!' => '！', ';' => '；', ':' => '：',
			',' => '，', '.' => '。', '?' => '？',
		]);
	}

	// ── spacing() – exact port of pangu.js v4.0.7 lines 627-673 ──────
	public static function spacingText(string $text): string {
		if ($text === '' || mb_strlen($text, 'UTF-8') <= 1) {
			return $text;
		}

		$cjk = self::CJK;

		// Quick bail-out: no CJK character at all
		if (!preg_match('/[' . $cjk . ']/u', $text)) {
			return $text;
		}

		$t = $text;

		// 1. CONVERT_TO_FULLWIDTH_CJK_SYMBOLS_CJK
		$t = preg_replace_callback(
			'/([' . $cjk . '])[ ]*([\:]+|\.)[ ]*([' . $cjk . '])/u',
			function ($m) { return $m[1] . self::convertToFullwidth($m[2]) . $m[3]; },
			$t
		) ?? $t;

		// 2. CONVERT_TO_FULLWIDTH_CJK_SYMBOLS
		$t = preg_replace_callback(
			'/([' . $cjk . '])[ ]*([~\!;,\?]+)[ ]*/u',
			function ($m) { return $m[1] . self::convertToFullwidth($m[2]); },
			$t
		) ?? $t;

		// 3. DOTS_CJK
		$t = preg_replace('/([\\.]{2,}|\x{2026})([' . $cjk . '])/u', '$1 $2', $t) ?? $t;

		// 4. FIX_CJK_COLON_ANS
		$t = preg_replace('/([' . $cjk . '])\\:([A-Z0-9\\(\\)])/u', '$1：$2', $t) ?? $t;

		// 5. CJK_QUOTE
		$t = preg_replace('/([' . $cjk . '])([`"\x{05F4}])/u', '$1 $2', $t) ?? $t;

		// 6. QUOTE_CJK
		$t = preg_replace('/([`"\x{05F4}])([' . $cjk . '])/u', '$1 $2', $t) ?? $t;

		// 7. FIX_QUOTE_ANY_QUOTE
		$t = preg_replace('/([`"\x{05F4}]+)[ ]*(.+?)[ ]*([`"\x{05F4}]+)/u', '$1$2$3', $t) ?? $t;

		// 8. CJK_SINGLE_QUOTE_BUT_POSSESSIVE
		$t = preg_replace('/([' . $cjk . "])('" . '[^s])/u', '$1 $2', $t) ?? $t;

		// 9. SINGLE_QUOTE_CJK
		$t = preg_replace("/(')([" . $cjk . '])/u', '$1 $2', $t) ?? $t;

		// 10. FIX_POSSESSIVE_SINGLE_QUOTE
		$t = preg_replace('/([A-Za-z0-9' . $cjk . "])( )(" . "'s)/u", "$1's", $t) ?? $t;

		// 11. HASH_ANS_CJK_HASH
		$t = preg_replace('/([' . $cjk . '])(#)([' . $cjk . ']+)(#)([' . $cjk . '])/u', '$1 $2$3$4 $5', $t) ?? $t;

		// 12. CJK_HASH
		$t = preg_replace('/([' . $cjk . '])(#([^ ]))/u', '$1 $2', $t) ?? $t;

		// 13. HASH_CJK
		$t = preg_replace('/(([^ ])#)([' . $cjk . '])/u', '$1 $3', $t) ?? $t;

		// 14. CJK_OPERATOR_ANS
		$t = preg_replace('/([' . $cjk . '])([\\+\\-\\*\\/=&\\|<>])([A-Za-z0-9])/u', '$1 $2 $3', $t) ?? $t;

		// 15. ANS_OPERATOR_CJK
		$t = preg_replace('/([A-Za-z0-9])([\\+\\-\\*\\/=&\\|<>])([' . $cjk . '])/u', '$1 $2 $3', $t) ?? $t;

		// 16. FIX_SLASH_AS
		$t = preg_replace('/([\/]) ([a-z\\-_\\.\\/]+)/u', '$1$2', $t) ?? $t;

		// 17. FIX_SLASH_AS_SLASH
		$t = preg_replace('/([\/\\.])([A-Za-z\\-_\\.\\/]+) ([\/])/u', '$1$2$3', $t) ?? $t;

		// 18. CJK_LEFT_BRACKET
		$t = preg_replace('/([' . $cjk . '])([\\(\\[\\{<>\x{201C}])/u', '$1 $2', $t) ?? $t;

		// 19. RIGHT_BRACKET_CJK
		$t = preg_replace('/([\\)\\]\\}<>\x{201D}])([' . $cjk . '])/u', '$1 $2', $t) ?? $t;

		// 20. FIX_LEFT_BRACKET_ANY_RIGHT_BRACKET  (no /g in JS — single replace)
		$t = preg_replace('/([\\(\\[\\{<\x{201C}]+)[ ]*(.+?)[ ]*([\\)\\]\\}>\x{201D}]+)/u', '$1$2$3', $t, 1) ?? $t;

		// 21. ANS_CJK_LEFT_BRACKET_ANY_RIGHT_BRACKET
		$t = preg_replace('/([A-Za-z0-9' . $cjk . '])[ ]*(\x{201C})([A-Za-z0-9' . $cjk . '\\-_ ]+)(\x{201D})/u', '$1 $2$3$4', $t) ?? $t;

		// 22. LEFT_BRACKET_ANY_RIGHT_BRACKET_ANS_CJK
		$t = preg_replace('/(\x{201C})([A-Za-z0-9' . $cjk . '\\-_ ]+)(\x{201D})[ ]*([A-Za-z0-9' . $cjk . '])/u', '$1$2$3 $4', $t) ?? $t;

		// 23. AN_LEFT_BRACKET
		$t = preg_replace('/([A-Za-z0-9])([\\(\\[\\{])/u', '$1 $2', $t) ?? $t;

		// 24. RIGHT_BRACKET_AN
		$t = preg_replace('/([\\)\\]\\}])([A-Za-z0-9])/u', '$1 $2', $t) ?? $t;

		// 25. CJK_ANS
		$t = preg_replace('/([' . $cjk . '])([A-Za-z\x{0370}-\x{03FF}0-9@\\$%\\^&\\*\\-\\+\\\\=\\|\\/\x{00A1}-\x{00FF}\x{2150}-\x{218F}\x{2700}\x{2014}\x{27BF}])/u', '$1 $2', $t) ?? $t;

		// 26. ANS_CJK
		$t = preg_replace('/([A-Za-z\x{0370}-\x{03FF}0-9~\\$%\\^&\\*\\-\\+\\\\=\\|\\/!;:,\\.\\?\x{00A1}-\x{00FF}\x{2150}-\x{218F}\x{2700}\x{2014}\x{27BF}])([' . $cjk . '])/u', '$1 $2', $t) ?? $t;

		// 27. S_A
		$t = preg_replace('/(%)([A-Za-z])/u', '$1 $2', $t) ?? $t;

		// 28. MIDDLE_DOT
		$t = preg_replace('/([ ]*)(\x{00B7}|\x{2022}|\x{2027})([ ]*)/u', '・', $t) ?? $t;

		return $t;
	}

	private static function needsSpaceBetween(string $left, string $right): bool {
		if ($left === '' || $right === '') {
			return false;
		}
		$test = $left . $right;
		return self::spacingText($test) !== $test;
	}

	/**
	 * Apply Pangu spacing to HTML content, touching only text nodes and
	 * also inserting spaces at boundaries between adjacent text nodes
	 * separated by inline tags (matching pangu.js DOM walker behaviour).
	 */
	public static function spacingHTML(string $html): string {
		if ($html === '') {
			return $html;
		}
		$parts = preg_split('/(<[^>]*>)/s', $html, -1, PREG_SPLIT_DELIM_CAPTURE);
		if ($parts === false) {
			return $html;
		}

		$blockish = '/^<\/?(?:div|p|h[1-6]|ul|ol|li|br|hr|img|table|thead|tbody|tr|td|th|blockquote|figure|figcaption|section|article|header|footer|nav|main|details|summary|dd|dt|dl)\b/i';
		$ignoreOpen = '/^<(code|pre|script|textarea|style)\b/i';
		$ignoreClose = '/^<\/(code|pre|script|textarea|style)\b/i';

		$insideIgnored = 0;
		$lastTextChar = '';
		$sawBlockTag = true;

		$n = count($parts);
		for ($i = 0; $i < $n; $i++) {
			if ($i % 2 === 1) {
				// HTML tag
				if (preg_match($ignoreOpen, $parts[$i])) {
					$insideIgnored++;
				} elseif (preg_match($ignoreClose, $parts[$i])) {
					$insideIgnored = max(0, $insideIgnored - 1);
				}
				if (preg_match($blockish, $parts[$i])) {
					$sawBlockTag = true;
					$lastTextChar = '';
				}
			} else {
				// Text segment
				if ($insideIgnored > 0 || $parts[$i] === '') {
					if ($parts[$i] !== '') {
						$lastTextChar = mb_substr($parts[$i], -1, 1, 'UTF-8');
						$sawBlockTag = false;
					}
					continue;
				}
				$spaced = self::spacingText($parts[$i]);
				if (!$sawBlockTag && $lastTextChar !== '') {
					$firstChar = mb_substr($spaced, 0, 1, 'UTF-8');
					if (self::needsSpaceBetween($lastTextChar, $firstChar)) {
						$spaced = ' ' . $spaced;
					}
				}
				$parts[$i] = $spaced;
				$lastTextChar = mb_substr($spaced, -1, 1, 'UTF-8');
				$sawBlockTag = false;
			}
		}

		return implode('', $parts);
	}

	// ── Configure / migration ─────────────────────────────────────────

	#[\Override]
	public function handleConfigureAction(): void {
		$this->registerTranslates();

		if (Minz_Request::isPost()) {
			$action = Minz_Request::paramString('action');
			if ($action === 'format_existing') {
				$count = $this->formatExistingArticles();
				$this->setUserConfiguration([
					'last_migration' => time(),
					'migrated_count' => $count,
				]);
			}
		}
	}

	private function formatExistingArticles(): int {
		$entryDao = FreshRSS_Factory::createEntryDao();
		$pdo = $entryDao->pdo;
		if (!$pdo) {
			return 0;
		}

		$batchSize = 500;
		$offset = 0;
		$totalFormatted = 0;

		while (true) {
			$selectStm = $pdo->prepare(
				'SELECT id, title, content FROM `_entry` ORDER BY id LIMIT ' . $batchSize . ' OFFSET ' . $offset
			);
			if ($selectStm === false) {
				break;
			}
			$selectStm->execute();
			$rows = $selectStm->fetchAll(PDO::FETCH_ASSOC);
			if (empty($rows)) {
				break;
			}

			$pdo->beginTransaction();
			try {
				$updateStm = $pdo->prepare(
					'UPDATE `_entry` SET title = :title, content = :content WHERE id = :id'
				);
				if ($updateStm === false) {
					$pdo->rollBack();
					break;
				}
				foreach ($rows as $row) {
					$newTitle = self::spacingText($row['title'] ?? '');
					$newContent = self::spacingHTML($row['content'] ?? '');
					if ($newTitle !== ($row['title'] ?? '') || $newContent !== ($row['content'] ?? '')) {
						$updateStm->bindValue(':title', $newTitle);
						$updateStm->bindValue(':content', $newContent);
						$updateStm->bindValue(':id', $row['id']);
						$updateStm->execute();
						$totalFormatted++;
					}
				}
				$pdo->commit();
			} catch (\Throwable $e) {
				$pdo->rollBack();
				Minz_Log::error('[PanguFormat] batch error: ' . $e->getMessage());
				break;
			}

			$offset += $batchSize;
			if (count($rows) < $batchSize) {
				break;
			}
		}

		Minz_Log::notice('[PanguFormat] formatted ' . $totalFormatted . ' articles');
		return $totalFormatted;
	}
}
