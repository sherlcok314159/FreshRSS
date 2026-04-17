<?php

class GeminiAssistantExtension extends Minz_Extension {
  public function init() {
    $this->registerTranslates();
    $this->registerController('geminiAssistant');
    $this->registerViews();
    $this->registerHook('entry_before_display', [$this, 'addGeminiButtons']);
    $this->registerHook('js_vars', [$this, 'injectStrings']);
    Minz_View::appendScript($this->getFileUrl('script.js', 'js'), false, false, false);
    Minz_View::appendStyle($this->getFileUrl('style.css', 'css'));
  }

  public function injectStrings(array $vars): array {
    $vars['gemini_strings'] = [
      'loading' => _t('ext.geminiAssistant.ui.loading'),
      'error' => _t('ext.geminiAssistant.ui.error'),
    ];
    return $vars;
  }

  public function handleConfigureAction() {
    $this->registerTranslates();
    if (Minz_Request::isPost()) {
      FreshRSS_Context::$user_conf->gemini_api_key = Minz_Request::param('gemini_api_key', '');
      FreshRSS_Context::$user_conf->gemini_model = Minz_Request::param('gemini_model', 'gemini-3-flash-preview');
      FreshRSS_Context::$user_conf->gemini_summary_prompt = Minz_Request::param('gemini_summary_prompt', '');
      FreshRSS_Context::$user_conf->gemini_thinking_level = Minz_Request::param('gemini_thinking_level', 'LOW');
      FreshRSS_Context::$user_conf->gemini_custom_css = Minz_Request::param('gemini_custom_css', '');
      FreshRSS_Context::$user_conf->save();
    }
  }

  private static function isApiRequest(): bool {
    return strpos($_SERVER['REQUEST_URI'] ?? '', '/api/') !== false;
  }

  public function addGeminiButtons(FreshRSS_Entry $entry): FreshRSS_Entry {
    $cached_summary = $entry->attributeString('gemini_summary');

    if (self::isApiRequest()) {
      if ($cached_summary !== null && $cached_summary !== '') {
        $entry->_content('<blockquote>' . $cached_summary . '</blockquote>' . $entry->content());
      }
      return $entry;
    }

    $this->registerTranslates();
    $custom_css = FreshRSS_Context::$user_conf->gemini_custom_css ?? '';

    $url_summary = Minz_Url::display(array(
      'c' => 'geminiAssistant',
      'a' => 'process',
      'params' => array(
        'id' => $entry->id(),
        'type' => 'summary',
      )));

    $summary_class = 'gemini-content hidden';
    $summary_style = '';
    $summary_raw_attr = '';
    if ($cached_summary !== null && $cached_summary !== '') {
      $summary_class = 'gemini-content';
      $summary_style = $custom_css;
      $summary_raw_attr = ' data-gemini-raw="' . htmlspecialchars($cached_summary, ENT_QUOTES, 'UTF-8') . '"';
    }

    $entry->_content(
      '<div class="gemini-assistant">'
      . '<div class="gemini-buttons">'
      . '<a class="btn" href="' . $url_summary . '" data-gemini-type="summary">'
      . _t('ext.geminiAssistant.ui.summarize_button') . '</a>'
      . '</div>'
      . '<div class="gemini-result" data-gemini-type="summary">'
      . '<p class="gemini-status hidden alert"></p>'
      . '<blockquote class="' . $summary_class . '" data-css="' . htmlspecialchars($custom_css, ENT_QUOTES) . '" style="' . $summary_style . '"' . $summary_raw_attr . '>'
      . '</blockquote>'
      . '</div>'
      . '</div>'
      . $entry->content());
    return $entry;
  }
}
