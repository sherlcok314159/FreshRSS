<?php

declare(strict_types=1);

final class HighlightExtension extends Minz_Extension {

	private string $highlightColor = '#4ade80';
	private bool $highlightEnabled = true;
	private bool $configLoaded = false;

	#[\Override]
	public function init(): void {
		parent::init();
		$this->registerTranslates();
		$this->registerHook('entry_before_display', [$this, 'injectHighlightData']);
		$this->registerHook('js_vars', [$this, 'jsVars']);
		Minz_View::appendStyle($this->getFileUrl('highlight.css', 'css'));
		Minz_View::appendScript($this->getFileUrl('highlight.js', 'js'), false, true, false);
		$this->registerController('highlight');
		$this->registerViews();
	}

	public function loadConfigValues(): void {
		if ($this->configLoaded) return;
		$this->configLoaded = true;
		$color = $this->getUserConfigurationValue('color');
		if (is_string($color) && $color !== '') {
			$this->highlightColor = $color;
		}
		$enabled = $this->getUserConfigurationValue('enabled');
		if ($enabled !== null) {
			$this->highlightEnabled = (bool)$enabled;
		}
	}

	/**
	 * @param array<string,mixed> $vars
	 * @return array<string,mixed>
	 */
	public function jsVars(array $vars): array {
		$this->loadConfigValues();
		$vars['highlight'] = [
			'enabled' => $this->highlightEnabled,
			'color' => $this->highlightColor,
			'iconUrl' => $this->getFileUrl('highlighter.svg', 'svg'),
			'i18n' => [
				'highlight' => _t('ext.highlight.highlight'),
				'remove' => _t('ext.highlight.remove'),
				'save_failed' => _t('ext.highlight.save_failed'),
				'highlights_title' => _t('ext.highlight.highlights_title'),
				'no_highlights' => _t('ext.highlight.no_highlights'),
				'load_more' => _t('ext.highlight.load_more'),
				'entries_count' => _t('ext.highlight.entries_count'),
				'highlights_n' => _t('ext.highlight.highlights_n'),
			],
		];
		return $vars;
	}

	public function injectHighlightData(FreshRSS_Entry $entry): FreshRSS_Entry {
		$this->loadConfigValues();
		if (!$this->highlightEnabled) {
			return $entry;
		}

		$highlights = $entry->attributeArray('highlights') ?? [];
		$json = htmlspecialchars(json_encode($highlights, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]', ENT_QUOTES, 'UTF-8');
		$entryId = htmlspecialchars((string)$entry->id(), ENT_QUOTES, 'UTF-8');

		$marker = '<div class="highlight-data" data-entry-id="' . $entryId . '" data-highlights="' . $json . '" style="display:none"></div>';
		$entry->_content($marker . $entry->content());

		return $entry;
	}

	#[\Override]
	public function handleConfigureAction(): void {
		$this->registerTranslates();

		if (Minz_Request::isPost()) {
			$this->setUserConfiguration([
				'color' => Minz_Request::paramString('highlight_color') ?: '#4ade80',
				'enabled' => Minz_Request::paramBoolean('highlight_enabled'),
			]);
			$this->configLoaded = false;
		}

		$this->loadConfigValues();
	}

	public function getHighlightColor(): string {
		return $this->highlightColor;
	}

	public function isHighlightEnabled(): bool {
		return $this->highlightEnabled;
	}
}
