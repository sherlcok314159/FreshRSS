<?php

declare(strict_types=1);

class HighlightDAO extends Minz_ModelPdo {
	private static bool $indexEnsured = false;

	private function ensureIndex(): void {
		if (self::$indexEnsured) return;
		self::$indexEnsured = true;
		try {
			$stm = $this->pdo->prepare(
				"CREATE INDEX IF NOT EXISTS idx_entry_highlights ON `_entry`(`date` DESC) WHERE `attributes` LIKE '%\"highlights\":[{%'"
			);
			if ($stm !== false) $stm->execute();
		} catch (\Throwable $e) {
		}
	}

	public function updateEntryAttributes(string $entryId, string $attributesJson): bool {
		$sql = 'UPDATE `_entry` SET attributes = :attributes WHERE id = :id';
		$stm = $this->pdo->prepare($sql);
		if ($stm !== false) {
			$stm->bindValue(':attributes', $attributesJson);
			$stm->bindValue(':id', $entryId);
			return $stm->execute();
		}
		return false;
	}

	/**
	 * Single query that returns entries + total count via window function,
	 * and uses json_extract to return only the highlights array instead of
	 * the full (potentially large) attributes blob.
	 *
	 * @return array{entries: array<int, array<string, mixed>>, total: int}
	 */
	public function getHighlightedEntriesWithCount(int $limit = 50, int $offset = 0): array {
		$this->ensureIndex();
		$sql = 'SELECT e.id, e.title, e.link, e.date, e.id_feed, '
			. 'json_extract(e.attributes, \'$.highlights\') AS highlights_json, '
			. 'f.name AS feed_name, '
			. 'COUNT(*) OVER() AS total_count '
			. 'FROM `_entry` e '
			. 'LEFT JOIN `_feed` f ON e.id_feed = f.id '
			. 'WHERE e.attributes LIKE :pattern '
			. 'ORDER BY e.date DESC '
			. 'LIMIT ' . intval($limit) . ' OFFSET ' . intval($offset);
		$stm = $this->pdo->prepare($sql);
		if ($stm === false) return ['entries' => [], 'total' => 0];
		$stm->bindValue(':pattern', '%"highlights":[{%');
		$stm->execute();
		$rows = $stm->fetchAll(PDO::FETCH_ASSOC) ?: [];
		$total = 0;
		if (!empty($rows)) {
			$total = (int)($rows[0]['total_count'] ?? 0);
			foreach ($rows as &$row) {
				unset($row['total_count']);
			}
			unset($row);
		}
		return ['entries' => $rows, 'total' => $total];
	}

	public function countHighlightedEntries(): int {
		$this->ensureIndex();
		$sql = 'SELECT COUNT(*) as count FROM `_entry` WHERE attributes LIKE :pattern';
		$stm = $this->pdo->prepare($sql);
		if ($stm === false) return 0;
		$stm->bindValue(':pattern', '%"highlights":[{%');
		$stm->execute();
		$row = $stm->fetch(PDO::FETCH_ASSOC);
		return (int)($row['count'] ?? 0);
	}
}

class FreshExtension_highlight_Controller extends Minz_ActionController {

	public function firstAction(): void {
		if (!FreshRSS_Auth::hasAccess()) {
			header('Content-Type: application/json; charset=UTF-8');
			header('HTTP/1.1 403 Forbidden');
			exit(json_encode(['status' => 'error', 'message' => 'Forbidden']));
		}
	}

	public function countAction(): void {
		$this->view->_layout(null);
		$dao = new HighlightDAO();
		header('Content-Type: application/json; charset=UTF-8');
		exit(json_encode(['count' => $dao->countHighlightedEntries()]));
	}

	private static function trimHighlightsForDisplay(string $highlightsJson): string {
		$highlights = json_decode($highlightsJson, true);
		if (!is_array($highlights)) return '[]';
		$trimmed = [];
		foreach ($highlights as $hl) {
			if (!is_array($hl)) continue;
			$item = ['text' => $hl['text'] ?? '', 'color' => $hl['color'] ?? '#4ade80'];
			if (!empty($hl['html'])) $item['html'] = $hl['html'];
			$trimmed[] = $item;
		}
		return json_encode($trimmed, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]';
	}

	public function listAction(): void {
		$page = max(1, (int)Minz_Request::paramString('page'));
		$limit = 50;
		$offset = ($page - 1) * $limit;

		$dao = new HighlightDAO();
		$result = $dao->getHighlightedEntriesWithCount($limit, $offset);
		$entries = $result['entries'];
		$total = $result['total'];

		foreach ($entries as &$entry) {
			if (isset($entry['highlights_json'])) {
				$entry['highlights_json'] = self::trimHighlightsForDisplay($entry['highlights_json']);
			}
		}
		unset($entry);

		if (Minz_Request::paramString('ajax') === '1') {
			$this->view->_layout(null);
			header('Content-Type: application/json; charset=UTF-8');
			exit(json_encode([
				'entries' => $entries,
				'total' => $total,
				'page' => $page,
				'hasMore' => ($offset + $limit) < $total,
			], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
		}

		$this->view->entries = $entries;
		$this->view->total = $total;
		$this->view->page = $page;
		$this->view->hasMore = ($offset + $limit) < $total;
	}

	public function saveAction(): void {
		$this->view->_layout(null);

		if (!Minz_Request::isPost()) {
			header('Content-Type: application/json; charset=UTF-8');
			exit(json_encode(['status' => 'error', 'message' => 'POST required']));
		}

		$entryId = Minz_Request::paramString('entry_id') ?: trim((string)($_POST['entry_id'] ?? ''));
		$highlightJson = Minz_Request::paramString('highlight', true) ?: trim((string)($_POST['highlight'] ?? ''));

		if ($entryId === '' || $highlightJson === '') {
			header('Content-Type: application/json; charset=UTF-8');
			exit(json_encode(['status' => 'error', 'message' => 'Missing parameters', 'entry_id' => $entryId]));
		}

		$highlight = json_decode($highlightJson, true);
		if (!is_array($highlight) || empty($highlight['id']) || empty($highlight['text'])) {
			header('Content-Type: application/json; charset=UTF-8');
			exit(json_encode(['status' => 'error', 'message' => 'Invalid highlight data']));
		}

		if (!empty($highlight['html'])) {
			$highlight['html'] = strip_tags(
				$highlight['html'],
				'<p><br><ul><ol><li><strong><b><em><i><code><pre><sub><sup><span><div><h1><h2><h3><h4><h5><h6><a><blockquote><table><thead><tbody><tr><th><td><dl><dt><dd><hr><math><annotation><semantics><mrow><mi><mo><mn><msub><msup><mfrac><mover><munder><mtext><mspace><mtable><mtr><mtd><msqrt><mroot>'
			);
		}

		$entryDao = FreshRSS_Factory::createEntryDao();
		$entry = $entryDao->searchById($entryId);

		if ($entry === null) {
			header('Content-Type: application/json; charset=UTF-8');
			exit(json_encode(['status' => 'error', 'message' => 'Entry not found', 'entry_id' => $entryId]));
		}

		$highlights = $entry->attributeArray('highlights') ?? [];
		$highlights[] = $highlight;
		$entry->_attribute('highlights', $highlights);

		$dao = new HighlightDAO();
		$ok = $dao->updateEntryAttributes(
			(string)$entry->id(),
			json_encode($entry->attributes(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{}'
		);

		header('Content-Type: application/json; charset=UTF-8');
		exit(json_encode(['status' => $ok ? 'ok' : 'error']));
	}

	public function deleteAction(): void {
		$this->view->_layout(null);

		if (!Minz_Request::isPost()) {
			header('Content-Type: application/json; charset=UTF-8');
			exit(json_encode(['status' => 'error', 'message' => 'POST required']));
		}

		$entryId = Minz_Request::paramString('entry_id') ?: trim((string)($_POST['entry_id'] ?? ''));
		$highlightId = Minz_Request::paramString('highlight_id') ?: trim((string)($_POST['highlight_id'] ?? ''));

		if ($entryId === '' || $highlightId === '') {
			header('Content-Type: application/json; charset=UTF-8');
			exit(json_encode(['status' => 'error', 'message' => 'Missing parameters']));
		}

		$entryDao = FreshRSS_Factory::createEntryDao();
		$entry = $entryDao->searchById($entryId);

		if ($entry === null) {
			header('Content-Type: application/json; charset=UTF-8');
			exit(json_encode(['status' => 'error', 'message' => 'Entry not found']));
		}

		$highlights = $entry->attributeArray('highlights') ?? [];
		$highlights = array_values(array_filter($highlights, function ($hl) use ($highlightId) {
			return is_array($hl) && ($hl['id'] ?? '') !== $highlightId;
		}));
		$entry->_attribute('highlights', $highlights);

		$dao = new HighlightDAO();
		$ok = $dao->updateEntryAttributes(
			(string)$entry->id(),
			json_encode($entry->attributes(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) ?: '{}'
		);

		header('Content-Type: application/json; charset=UTF-8');
		exit(json_encode(['status' => $ok ? 'ok' : 'error']));
	}
}
